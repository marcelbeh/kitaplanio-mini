import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { cloudClient } from './client'
import { verifyCloudAccess } from './access'
import { CloudSync } from './CloudSync'
import { ACTIVE_KEY, leaveWorkspace } from './workspace'
import './cloud.css'

export function CloudAccount() {
  const [initial] = useState(cloudClient)
  const [owner, setOwner] = useState<string>()
  const [syncStatus, setSyncStatus] = useState('Lokal')
  const [revision, setRevision] = useState(0)
  const [connected, setConnected] = useState(false), [checking, setChecking] = useState(!!initial.client)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(initial.message)
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  useEffect(() => {
    const client = initial.client
    if (!client) return
    const refresh = () => setRevision(value => value + 1)
    // Never call Supabase methods inside the auth callback (avoids auth-lock deadlocks).
    const { data } = client.auth.onAuthStateChange((event, session) => {
      try {
        const activeOwner = window.localStorage.getItem(ACTIVE_KEY)
        if (event === 'SIGNED_OUT' || (session?.user.id && activeOwner && activeOwner !== session.user.id)) {
          leaveWorkspace(); setOwner(undefined)
        }
      } catch { /* Storage failure never deletes datasets or grants cloud access. */ }
      refresh()
    })
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { data.subscription.unsubscribe(); window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [initial])
  useEffect(() => {
    const client = initial.client
    if (!client) return
    let active = true
    setChecking(true)
    void verifyCloudAccess(client).then(result => {
      if (!active) return
      setConnected(result.connected); setOwner(result.userId); setChecking(false)
      if (result.message) setMessage(result.message)
      else if (result.connected) setMessage('')
      if (result.denied) void client.auth.signOut({ scope: 'local' }).catch(() => { /* RLS denies access regardless of client cleanup. */ })
    })
    return () => { active = false }
  }, [initial, revision])
  async function login(event: FormEvent) {
    event.preventDefault()
    if (!initial.client || busy) return
    setBusy(true); setMessage('')
    try {
      const result = await initial.client.auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) setMessage('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen; nur freigeschaltete Konten haben Cloud-Zugriff.')
      else { setEmail(''); setRevision(value => value + 1) }
    } catch { setMessage('Anmeldung derzeit nicht möglich. Bitte Verbindung prüfen oder lokal weiterarbeiten.') }
    finally { setPassword(''); setBusy(false) }
  }
  async function logout() {
    if (!initial.client || busy) return
    setBusy(true)
    try {
      const { error } = await initial.client.auth.signOut({ scope: 'local' })
      if (error) setMessage('Abmeldung fehlgeschlagen. Bitte erneut versuchen.')
      else { leaveWorkspace(); setOwner(undefined); setConnected(false); setMessage('Abgemeldet. Lokale Daten bleiben erhalten.') }
    } catch { setMessage('Abmeldung derzeit nicht möglich. Bitte erneut versuchen.') }
    finally { setBusy(false) }
  }
  return <details className="cloud-account"><summary aria-label="Cloud-Anmeldung"><span className="status">{checking ? 'Verbindung prüfen …' : connected ? `Cloud · ${syncStatus}` : syncStatus !== 'Lokal' ? syncStatus : 'Lokal'}</span></summary>
    <section className="cloud-panel kita-setup employee-page" aria-label="caro. Anmeldung">
      <h2>{connected ? 'Cloud verbunden' : 'Bei caro. anmelden'}</h2>
      <p className="kita-help">Mit Herz geplant. Lokale Funktionen bleiben verfügbar. Cloud-Synchronisierung erfolgt ausschließlich nach deiner Einrichtung und auf Knopfdruck.</p>
      {message && <p className="kita-help" role="status">{message}</p>}
      {checking ? <p role="status">Anmeldung und Freigabe werden geprüft …</p> : connected ? <button className="kita-button secondary" disabled={busy} onClick={logout}>{busy ? 'Abmelden …' : 'Abmelden'}</button> : initial.client && <form onSubmit={login}>
        <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>
        <label>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} /></label>
        <button className="kita-button" type="submit" disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
      </form>}
      <CloudSync client={initial.client} owner={owner} onStatus={setSyncStatus} />
      <p className="kita-help">Keine öffentliche Registrierung. Konten werden ausschließlich administrativ freigeschaltet. Die Anmeldung schützt Cloud-Daten; lokale Browserdaten bleiben lokal zugänglich.</p>
    </section>
  </details>
}
