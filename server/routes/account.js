import express from 'express';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const router = express.Router();

// Service-role client. NEVER expose this key to the iOS client.
// It bypasses RLS and can perform admin operations like deleting
// rows from auth.users.
//
// Constructed lazily on first request — not at module import — so a
// deploy that hasn't set SUPABASE_SERVICE_ROLE_KEY yet still boots
// the server (and the /analyze route stays online). Callers that hit
// /account before the env is configured get a 503 with a clear
// message instead of a process-wide crash.
let _adminClient = null;
let _adminClientError = null;

function getAdminClient() {
  if (_adminClient) return { client: _adminClient, error: null };
  if (_adminClientError) return { client: null, error: _adminClientError };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [];
  if (!url) missing.push('SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    _adminClientError = `Server is missing required env vars: ${missing.join(', ')}`;
    return { client: null, error: _adminClientError };
  }

  try {
    _adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return { client: _adminClient, error: null };
  } catch (e) {
    _adminClientError = `Failed to initialize admin client: ${e.message || e}`;
    return { client: null, error: _adminClientError };
  }
}

/**
 * DELETE /account
 * Headers: Authorization: Bearer <user_jwt>
 *
 * App Store Review Guideline 5.1.1(v) — user-initiated account
 * deletion. Verifies the caller's JWT against Supabase, extracts the
 * user_id from that verified token (never trusts a client-supplied
 * id), then permanently deletes the auth.users row. All foreign-keyed
 * tables (profiles, food_logs, coach_observations, weekly_recaps)
 * cascade-delete via `references auth.users(id) on delete cascade`.
 *
 * Storage cleanup happens client-side BEFORE this endpoint is called.
 * If the storage cleanup partially fails, this endpoint still
 * succeeds — an orphaned 60kB JPEG is a smaller harm than leaving an
 * auth row the user believes is deleted.
 */
router.delete('/account', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed authorization' });
  }
  const token = authHeader.slice(7);

  const { client: adminClient, error: clientError } = getAdminClient();
  if (clientError) {
    console.error('[account-delete]', clientError);
    return res.status(503).json({
      error: 'Account deletion is temporarily unavailable.',
      detail: clientError,
    });
  }

  const { data: getUserData, error: verifyError } =
    await adminClient.auth.getUser(token);

  if (verifyError || !getUserData || !getUserData.user) {
    console.warn('[account-delete] token verification failed:', verifyError && verifyError.message);
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = getUserData.user.id;

  const { error: deleteError } =
    await adminClient.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error('[account-delete] failed:', deleteError);
    return res.status(500).json({
      error: 'Failed to delete account',
      detail: deleteError.message,
    });
  }

  console.log(`[account-delete] success: user_id=${userId}`);
  return res.status(200).json({ deleted: true, user_id: userId });
});

export default router;
