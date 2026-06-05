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
import { verifyStoreKitTransaction } from '../lib/storeKitVerify.js';

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

export default router;
