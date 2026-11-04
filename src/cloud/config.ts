export type CloudConfiguration = { mode: 'local' } | { mode: 'ready'; url: string; key: string } | { mode: 'invalid'; message: string }
export function cloudConfiguration(urlValue?: string, keyValue?: string): CloudConfiguration {
  const url = urlValue?.trim() ?? '', key = keyValue?.trim() ?? ''
  if (!url && !key) return { mode: 'local' }
  const invalid: CloudConfiguration = { mode: 'invalid', message: 'Cloud-Konfiguration ungültig. Benötigt werden die HTTPS-Supabase-Projekt-URL und ausschließlich ein Publishable Key.' }
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return invalid
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || parsed.port) return invalid
    return { mode: 'ready', url: parsed.origin, key }
  } catch { return invalid }
}
