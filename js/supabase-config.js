/* ============================================================
   PONCHO CUSTOM MUSIC — Supabase Config
   Replace SUPABASE_URL and SUPABASE_ANON_KEY with your values.
   NEVER put the service_role key here — only in Edge Functions.
   ============================================================ */

const SUPABASE_URL     = 'https://vtbifrcnjrvqgwtjdood.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0YmlmcmNuanJ2cWd3dGpkb29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NjA2NTksImV4cCI6MjA5MTQzNjY1OX0.N9RfktBRetArOGrhn4d5LbgJKphsMsbLa2A0wQi-a_E';
const FUNCTIONS_URL    = `${SUPABASE_URL}/functions/v1`;

// Supabase client (loaded via CDN script tag on every page)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Call a Supabase Edge Function.
 * Automatically injects the admin JWT when a session exists.
 * @param {string} name  - Edge function name
 * @param {object} body  - JSON body
 * @returns {Promise<object>}
 */
async function callFunction(name, body = {}) {
  const { data: { session } } = await sb.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Error ${res.status}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
