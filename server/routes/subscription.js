// Phase 22 — subscription validate + status endpoints.
//
// /subscription/validate: client posts the StoreKit 2 signed JWS for a
// purchase. We verify the signature against Apple Root CA G3, parse the
// payload, and (on success) flip the user's tier to 'pro' with
// pro_expires_at = transaction.expiresDate. Replays of the same JWS are
// safe — the same expiresDate is written again, and the user remains pro.
//
// /subscription/status: read-only — returns the entitlement the iOS UI
// mirrors. The iOS client calls this on launch, after purchase, and
// when /analyze rejects with 429 (so the UI can sync the count).

import express from 'express';
import {
  authenticate,
  parseLocalDate,
  nextLocalMidnight,
  computeEntitlement,
  loadProfile,
  readScanCount,
} from '../lib/scanLimits.js';
import {
  verifyStoreKitTransaction,
  verifyAppleJWS,
  decodeVerifiedTransaction,
} from '../lib/storeKitVerify.js';
import { getAdminClient } from '../client/supabaseAdmin.js';

const router = express.Router();

router.post('/subscription/validate', express.json({ limit: '32kb' }), async (req, res) => {
  const auth = await authenticate(req);
  if (auth.errorStatus) {
    return res.status(auth.errorStatus).json(auth.errorBody);
  }
  const { userId, adminClient } = auth;

  const jws = req.body && req.body.transactionJWS;
  let payload;
  try {
    payload = verifyStoreKitTransaction(jws);
  } catch (e) {
    console.warn(`[subscription.validate] reject user=${userId} reason=${e.message}`);
    return res.status(400).json({ error: 'invalid_transaction', detail: e.message });
  }

  // Persist the entitlement. pro_expires_at is the only durable signal
  // we use; the status endpoint then computes whether pro is still
  // active by comparing against now() on every read.
  const expiresAtIso = new Date(payload.expiresDate).toISOString();
  const { error: updateErr } = await adminClient
    .from('profiles')
    .update({ tier: 'pro', pro_expires_at: expiresAtIso })
    .eq('id', userId);
  if (updateErr) {
    console.error('[subscription.validate] update failed', updateErr.message);
    return res.status(500).json({ error: 'persist_failed' });
  }

  console.log(`[subscription.validate] pro granted user=${userId} expires=${expiresAtIso} product=${payload.productId}`);

  // Echo the entitlement back so the client can sync immediately.
  const localDate = parseLocalDate(req.body && req.body.localDate);
  const profile = { tier: 'pro', pro_expires_at: expiresAtIso, signup_date: null };
  const ent = computeEntitlement({
    tier: profile.tier,
    signupDate: profile.signup_date,
    proExpiresAt: profile.pro_expires_at,
  });
  const used = await readScanCount(adminClient, userId, localDate);
  return res.json({
    tier: ent.tier,
    limit: ent.limit,
    unlimited: ent.unlimited,
    scansUsedToday: used,
    resetsAt: nextLocalMidnight(localDate),
    proExpiresAt: ent.proExpiresAt,
  });
});

router.get('/subscription/status', async (req, res) => {
  const auth = await authenticate(req);
  if (auth.errorStatus) {
    return res.status(auth.errorStatus).json(auth.errorBody);
  }
  const { userId, adminClient } = auth;

  const localDate = parseLocalDate(req.query && req.query.localDate);
  const profile = await loadProfile(adminClient, userId);
  if (!profile) {
    // Profile row missing — unusual but possible if the new-user trigger
    // hasn't run yet. Return safe-default free with no usage.
    return res.json({
      tier: 'free',
      limit: 4,
      unlimited: false,
      scansUsedToday: 0,
      resetsAt: nextLocalMidnight(localDate),
      proExpiresAt: null,
    });
  }
  const ent = computeEntitlement({
    tier: profile.tier,
    signupDate: profile.signup_date,
    proExpiresAt: profile.pro_expires_at,
  });
  const used = await readScanCount(adminClient, userId, localDate);
  return res.json({
    tier: ent.tier,
    limit: ent.limit,
    unlimited: ent.unlimited,
    scansUsedToday: used,
    resetsAt: nextLocalMidnight(localDate),
    proExpiresAt: ent.proExpiresAt,
  });
});

// /subscription/notifications — App Store Server Notifications V2.
//
// Apple POSTs { signedPayload } to this URL on every subscription lifecycle
// event (SUBSCRIBED, DID_RENEW — including a trial converting to paid —
// EXPIRED, DID_CHANGE_RENEWAL_STATUS, REFUND, REVOKE, …). This is what
// hardens tracking: the server learns of conversions/cancellations even when
// the app is never opened, closing the "renewed-while-closed" gap.
//
// Auth is the JWS signature itself (anchored to Apple Root CA G3) — there is
// no bearer token; a forged notification can't produce a valid Apple chain.
// We map the event to our user via `appAccountToken`, which the iOS client
// sets to the Supabase user id at purchase time. Purchases made before that
// wiring carry no token and are acked-without-mapping (the client's own
// re-validation still covers them on next launch).
//
// Response contract: Apple retries on any non-2xx. So we return 2xx for
// permanent no-ops (unmappable) to stop the retry storm, and 5xx only for
// transient failures (DB down) where a retry could succeed.
router.post('/subscription/notifications', express.json({ limit: '256kb' }), async (req, res) => {
  const signedPayload = req.body && req.body.signedPayload;
  if (!signedPayload) {
    return res.status(400).json({ error: 'missing_signedPayload' });
  }

  let notification;
  try {
    notification = verifyAppleJWS(signedPayload);
  } catch (e) {
    console.warn(`[subscription.notifications] bad signature reason=${e.message}`);
    return res.status(400).json({ error: 'invalid_signature', detail: e.message });
  }

  const type = notification.notificationType;
  const subtype = notification.subtype || '';
  const env = (notification.data && notification.data.environment) || 'unknown';

  // Apple's "Request a Test Notification" (and the RequestTestNotification
  // API) send type=TEST with NO transaction — ack it so the App Store Connect
  // dashboard confirms the endpoint is reachable and verifying signatures.
  if (type === 'TEST') {
    console.log(`[subscription.notifications] TEST received env=${env} — endpoint OK`);
    return res.status(200).json({ ok: true, test: true });
  }

  let tx;
  try {
    const txJWS = notification.data && notification.data.signedTransactionInfo;
    if (!txJWS) throw new Error('no signedTransactionInfo');
    tx = decodeVerifiedTransaction(txJWS);
  } catch (e) {
    console.warn(`[subscription.notifications] reject type=${type} reason=${e.message}`);
    return res.status(400).json({ error: 'invalid_notification', detail: e.message });
  }

  // Map to our user. appAccountToken == Supabase profiles.id (a UUID) set by
  // the client at purchase. Renewals keep the same token as the original.
  const appAccountToken = tx.appAccountToken;
  if (!appAccountToken) {
    console.warn(`[subscription.notifications] unmapped type=${type}/${subtype} env=${env} origTx=${tx.originalTransactionId} — no appAccountToken; acking`);
    return res.status(200).json({ ok: true, mapped: false });
  }

  const { client: adminClient, error: clientError } = getAdminClient();
  if (clientError) {
    console.error('[subscription.notifications] admin client unavailable');
    return res.status(503).json({ error: 'unavailable' }); // transient → Apple retries
  }

  // Decide the entitlement, GUARDING against Apple's out-of-order / retried
  // delivery (order isn't guaranteed; delayed notifications retry for ~3 days).
  // We compare this transaction's expiry against what we've already stored so a
  // STALE notification can't regress a newer entitlement — e.g. a late
  // SUBSCRIBED (trial expiry) arriving after DID_RENEW (paid expiry) must not
  // shorten a paying user, and a stale EXPIRED must not free a since-renewed sub.
  const TERMINATION = new Set(['REFUND', 'REVOKE']);
  const active = !TERMINATION.has(type)
    && typeof tx.expiresDate === 'number'
    && tx.expiresDate > Date.now();
  const txMs = typeof tx.expiresDate === 'number' ? tx.expiresDate : 0;

  const { data: current, error: readErr } = await adminClient
    .from('profiles')
    .select('pro_expires_at')
    .eq('id', appAccountToken)
    .maybeSingle();
  if (readErr) {
    console.error('[subscription.notifications] read failed', readErr.message);
    return res.status(500).json({ error: 'read_failed' }); // transient → Apple retries
  }
  const storedMs = current && current.pro_expires_at ? Date.parse(current.pro_expires_at) : 0;

  let update = null;
  if (active) {
    // Renewal / (re)subscribe: only EXTEND, never shorten. Also drops
    // duplicate/idempotent replays (txMs === storedMs) to a no-op.
    if (txMs > storedMs) update = { tier: 'pro', pro_expires_at: new Date(txMs).toISOString() };
  } else {
    // Termination or past expiry: only act when this event concerns the
    // current-or-latest period we know of. A stale downgrade for an older
    // period (the user has since renewed) is ignored.
    if (txMs >= storedMs) update = { tier: 'free', pro_expires_at: null };
  }

  if (!update) {
    console.log(`[subscription.notifications] stale/no-op type=${type}/${subtype} env=${env} user=${appAccountToken} txExpiry=${txMs} stored=${storedMs}`);
    return res.status(200).json({ ok: true, applied: false });
  }

  const { error: updErr, count } = await adminClient
    .from('profiles')
    .update(update, { count: 'exact' })
    .eq('id', appAccountToken);
  if (updErr) {
    console.error('[subscription.notifications] persist failed', updErr.message);
    return res.status(500).json({ error: 'persist_failed' }); // transient → Apple retries
  }

  // Revenue-funnel analytics. The client can't see the app-closed DID_RENEW, so
  // the true trial→paid conversion is captured HERE as `subscription_renewed`
  // (a paid renewal, incl. the first one after a trial). Service role → we may
  // set user_id explicitly. Best-effort; a failure here never fails the ack.
  // The out-of-order guard above already dropped stale/duplicate events, so
  // this fires once per real renewal/expiry.
  const lifecycleEvent =
    type === 'DID_RENEW' ? 'subscription_renewed'
      : type === 'EXPIRED' ? 'subscription_expired'
        : null;
  if (lifecycleEvent) {
    const { error: aErr } = await adminClient
      .from('analytics_events')
      .insert({ user_id: appAccountToken, name: lifecycleEvent,
                props: { product: tx.productId, env } });
    if (aErr) console.warn('[subscription.notifications] analytics insert failed', aErr.message);
  }

  console.log(`[subscription.notifications] type=${type}/${subtype} env=${env} user=${appAccountToken} → ${update.tier} expires=${update.pro_expires_at || 'null'} product=${tx.productId} rows=${count}`);
  return res.status(200).json({ ok: true });
});

export default router;
