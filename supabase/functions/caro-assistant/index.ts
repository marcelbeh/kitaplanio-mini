import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { createAssistantHandler } from './handler.ts'
import { authorizeMember } from './authorize.ts'

Deno.serve(createAssistantHandler({
  apiKey: Deno.env.get('GEMINI_API_KEY') ?? '',
  model: Deno.env.get('GEMINI_MODEL') ?? '',
  origins: (Deno.env.get('CARO_ALLOWED_ORIGINS') ?? 'https://marcelbeh.github.io').split(',').map(value => value.trim()).filter(Boolean),
  async authorize(token, signal) {
    // Same authorization contract as src/cloud/access.ts, independently verified on the server.
    // A new, user-scoped client for every call: no service-role key or shared auth session.
    const key = Deno.env.get('CARO_SUPABASE_PUBLISHABLE_KEY') ?? ''
    if (!key.startsWith('sb_publishable_')) throw Error('configuration')
    const client = createClient(Deno.env.get('SUPABASE_URL') ?? '', key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (url, init) => fetch(url, { ...init, signal }) },
    })
    return authorizeMember({
      getUser: jwt => client.auth.getUser(jwt),
      getMember: userId => client.from('caro_members').select('user_id, enabled').eq('user_id', userId).eq('enabled', true).maybeSingle(),
    }, token)
  },
}))
