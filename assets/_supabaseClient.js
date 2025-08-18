// assets/_supabaseClient.js
import { createClient } from '@supabase/supabase-js';

/**
 * IMPORTANT:
 *  - SUPABASE_URL  = your "Project URL"
 *  - SUPABASE_KEY  = your "Publishable key" (anon/public)
 *  - Do NOT use the service_role key here.
 */
const SUPABASE_URL = 'https://ngtbivfiqekbyypedkuz.supabase.coo';
const SUPABASE_KEY = 'sb_publishable_wM0xuQ5O3OUtDOMo1sPcZg_brujOuzQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
