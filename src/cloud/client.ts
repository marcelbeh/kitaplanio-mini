import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cloudConfiguration } from './config'
let client: SupabaseClient | null = null
export function cloudClient() {
  try {
    // Static accesses avoid bundling unrelated VITE_* environment variables.
    const config = cloudConfiguration(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    if (config.mode !== 'ready') return { client: null, message: config.mode === 'invalid' ? config.message : 'Cloud-Anmeldung ist noch nicht eingerichtet. Die App bleibt lokal nutzbar.' }
    client ??= createClient(config.url, config.key, { auth: { storageKey: 'caro:auth:v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', debug: false } })
    return { client, message: '' }
  } catch { return { client: null, message: 'Cloud-Anmeldung ist in diesem Browser nicht verfügbar. Lokale Daten bleiben erhalten.' } }
}
