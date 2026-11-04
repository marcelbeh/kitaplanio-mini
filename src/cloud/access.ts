import type { SupabaseClient } from '@supabase/supabase-js'
export type CloudAccess = { connected: boolean; userId?: string; denied?: boolean; message: string }
// A remote getUser plus the RLS-protected allowlist is required; local session data never grants access.
export async function verifyCloudAccess(client: SupabaseClient): Promise<CloudAccess> {
  try {
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) return { connected: false, message: error && error.name !== 'AuthSessionMissingError' ? 'Cloud-Sitzung konnte nicht bestätigt werden. Bitte erneut anmelden oder lokal weiterarbeiten.' : '' }
    const member = await client.from('caro_members').select('user_id').eq('user_id', data.user.id).eq('enabled', true).maybeSingle()
    if (member.error) return { connected: false, message: 'Cloud-Freigabe konnte nicht geprüft werden. Bitte Verbindung und Einrichtung prüfen. Lokal bleibt alles verfügbar.' }
    if (!member.data || member.data.user_id !== data.user.id) return { connected: false, denied: true, message: 'Dieses Konto ist für caro. nicht freigeschaltet. Bitte die Leitung kontaktieren.' }
    return { connected: true, userId: data.user.id, message: '' }
  } catch { return { connected: false, message: 'Cloud derzeit nicht erreichbar. Lokale Daten bleiben unverändert.' } }
}
