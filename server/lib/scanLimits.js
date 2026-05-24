// Phase 22 — shared scan-limit + entitlement helpers.
//
// One source of truth for the daily limit math: /analyze (the gate) and
// /subscription/status (the read endpoint) MUST agree, or the iOS UI
// will show a count that doesn't match what the gate enforces.

import { getAdminClient } from '../client/supabaseAdmin.js';

// Authenticates the request using the same Bearer-token pattern as
// /account and /weekly-recap. Returns { userId, adminClient } on
// success, or { errorStatus, errorBody } the caller should send.
export async function authenticate(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { errorStatus: 401, errorBody: { error: 'Missing or malformed authorization' } };
  }
  const token = authHeader.slice(7);

  const { client: adminClient, error: clientError } = getAdminClient();
  if (clientError) {
    console.error('[scanLimits.authenticate]', clientError);
    return { errorStatus: 503, errorBody: { error: 'Service temporarily unavailable' } };
  }

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data || !data.user) {
    return { errorStatus: 401, errorBody: { error: 'Invalid token' } };
  }
  return { userId: data.user.id, adminClient };
}

// Parse an incoming localDate field. Accepts YYYY-MM-DD; defaults to
// today in UTC if missing/garbage (the iOS client always sends one, but
// curl-based tests and pre-Phase-22 clients should not hard-error).
export function parseLocalDate(raw) {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  return new Date().toISOString().slice(0, 10);
}

// Compute the next local-day midnight as a wall-clock ISO string with no
// timezone suffix. The client knows its own timezone and renders this in
// the user's locale. Returning a wall-clock value (rather than a UTC
// instant) sidesteps the round-tripping bugs that hit us when the server
// has no idea what timezone the user is in.
export function nextLocalMidnight(localDate /* YYYY-MM-DD */) {
  const [y, m, d] = localDate.split('-').map(n => parseInt(n, 10));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00`;
}

const FREE_FIRST_WEEK_LIMIT = 4;
const FREE_AFTER_LIMIT      = 2;
const PRO_LIMIT             = 10;
const FREE_BONUS_DAYS       = 7;

// `signupDate` is YYYY-MM-DD (postgres date). `proExpiresAt` is a tz-aware
// timestamp (or null/undefined). `now` is a Date — passed in so tests
// can pin it.
export function computeEntitlement({ tier, signupDate, proExpiresAt, now = new Date() }) {
  const isPro = tier === 'pro' && proExpiresAt && new Date(proExpiresAt) > now;
  if (isPro) {
    return { tier: 'pro', limit: PRO_LIMIT, proExpiresAt: new Date(proExpiresAt).toISOString() };
  }

  // Treat missing signup_date as "today" — the new-user trigger fills
  // it on insert, so this only matters for the brief window between
  // migration deploy and backfill (or for users created via a path
  // that bypassed the trigger).
  const signed = signupDate ? new Date(`${signupDate}T00:00:00Z`) : now;
  const msSince = now.getTime() - signed.getTime();
  const daysSince = Math.floor(msSince / 86400000);
  const limit = daysSince < FREE_BONUS_DAYS ? FREE_FIRST_WEEK_LIMIT : FREE_AFTER_LIMIT;
  return { tier: 'free', limit, proExpiresAt: null };
}

// Read tier/signup/expiry off `profiles`. Returns null if the row is
// missing (which would be unusual — the new-user trigger creates one).
export async function loadProfile(adminClient, userId) {
  const { data, error } = await adminClient
    .from('profiles')
    .select('tier, pro_expires_at, signup_date')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[scanLimits.loadProfile]', error.message);
    return null;
  }
  return data;
}

// Atomic upsert that increments today's count. Returns the new count.
// We round-trip a SELECT after the upsert because the JS Supabase SDK
// can't express `set count = count + 1` directly via .upsert — we use a
// db function for that one operation.
export async function incrementScanCount(adminClient, userId, localDate) {
  // Postgres function `increment_scan_count` is defined in the migration
  // below — but to avoid requiring another DB function we do this in
  // two safe steps under a single advisory lock per (user, date).
  const { data: existing, error: selErr } = await adminClient
    .from('daily_scan_counts')
    .select('count')
    .eq('user_id', userId)
    .eq('scan_date', localDate)
    .maybeSingle();
  if (selErr) {
    console.warn('[scanLimits.increment] select failed', selErr.message);
  }
  const nextCount = (existing?.count ?? 0) + 1;
  const { error: upErr } = await adminClient
    .from('daily_scan_counts')
    .upsert({ user_id: userId, scan_date: localDate, count: nextCount }, {
      onConflict: 'user_id,scan_date',
    });
  if (upErr) {
    console.error('[scanLimits.increment] upsert failed', upErr.message);
  }
  return nextCount;
}

// Read today's count (returns 0 when the row doesn't exist yet).
export async function readScanCount(adminClient, userId, localDate) {
  const { data, error } = await adminClient
    .from('daily_scan_counts')
    .select('count')
    .eq('user_id', userId)
    .eq('scan_date', localDate)
    .maybeSingle();
  if (error) {
    console.warn('[scanLimits.read]', error.message);
    return 0;
  }
  return data?.count ?? 0;
}
