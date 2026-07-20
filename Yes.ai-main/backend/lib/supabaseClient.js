// backend/lib/supabaseClient.js
// Single shared Supabase client using the SERVICE ROLE key.
// The service role key bypasses Row Level Security — this is intentional,
// because the backend needs to read/write across every client's rows.
// NEVER expose this key in frontend code.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[supabaseClient] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars — running with a placeholder client. Any real database call will fail until these are set in Railway.');
}

// createClient() only validates that the URL is well-formed — it does not
// connect at construction time. Passing a placeholder here (instead of the
// real, possibly-missing env vars) means a missing .env no longer crashes
// the whole process on startup; individual Supabase calls will simply fail
// at the point they're used, which every route already handles gracefully.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-service-role-key'
);
