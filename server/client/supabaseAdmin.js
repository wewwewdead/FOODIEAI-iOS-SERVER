import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Service-role Supabase client. NEVER expose this key to the iOS client.
// It bypasses RLS and can perform admin operations like deleting
// rows from auth.users and verifying user JWTs via auth.getUser(token).
//
// Constructed lazily on first request — not at module import — so a
// deploy that hasn't set SUPABASE_SERVICE_ROLE_KEY yet still boots
// the server (and the /analyze route stays online). Callers that hit
// a protected route before the env is configured get a 503 with a
// clear message instead of a process-wide crash.
let _adminClient = null;
let _adminClientError = null;

export function getAdminClient() {
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
