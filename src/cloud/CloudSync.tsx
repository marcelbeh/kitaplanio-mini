import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { equal, overview } from './dataset'
import { ACTIVE_KEY, CACHE_PREFIX, DIRTY_EVENT, WORKSPACE_EVENT, isDirty, leaveWorkspace, readWorkspace } from './workspace'
import { openWorkspace, resolveConflict, supabaseRemote, synchronize } from './sync'
import { BackupCheck, CloudSetup } from './CloudSetup'
import { captureLocal, makeBackup, verifyBackupFile } from './firstImport'
import type { LocalBackup } from './firstImport'
import type { CloudRecord, Conflict, SyncResult } from './sync'

export function CloudSync({ client, owner, onStatus }: { client: SupabaseClient | null; owner?: string; onStatus: (status: string) => void }) {
  const liveOwner = useRef(owner), authEpoch = useRef(0)
  liveOwner.current = owner
  const [, refresh] = useState(0), [online, setOnline] = useState(navigator.onLine)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [opening, setOpening] = useState<CloudRecord | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [openingBackup, setOpeningBackup] = useState<LocalBackup | null>(null), [openingProof, setOpeningProof] = useState<LocalBackup | null>(null)
  const [choice, setChoice] = useState<'local' | 'cloud' | null>(null)
  let workspace = null, storageError = ''
  try { workspace = readWorkspace(window.localStorage) } catch { storageError = 'Arbeitsbestand konnte nicht gelesen werden. Keine Daten wurden überschrieben.' }
  const status = !online ? 'Offline' : conflict ? 'Konflikt' : workspace ? isDirty(workspace) ? 'Lokale Änderungen' : 'Synchronisiert' : 'Lokal'
  useEffect(() => { onStatus(status) }, [status, onStatus])
  useEffect(() => {
    const update = () => refresh(value => value + 1)
    const connection = () => setOnline(navigator.onLine)
    const storage = (event: StorageEvent) => {
      if (event.key === ACTIVE_KEY || event.key?.startsWith(CACHE_PREFIX)) {
        update(); window.dispatchEvent(new Event(WORKSPACE_EVENT))
      }
    }
    window.addEventListener(DIRTY_EVENT, update); window.addEventListener(WORKSPACE_EVENT, update)
    window.addEventListener('online', connection); window.addEventListener('offline', connection); window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(DIRTY_EVENT, update); window.removeEventListener(WORKSPACE_EVENT, update)
      window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('storage', storage)
    }
  }, [])
  useEffect(() => { setConflict(null); setOpening(null); setChoice(null); setMessage(''); setSetupOpen(false); setOpeningBackup(null); setOpeningProof(null) }, [owner])
  useEffect(() => {
    if (!client) return
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== liveOwner.current) authEpoch.current++
    })
    return () => data.subscription.unsubscribe()
  }, [client])
  function remote() {
    const expectedOwner = owner, epoch = authEpoch.current
    const backend = supabaseRemote(client!, owner!)
    const check = () => { if (liveOwner.current !== expectedOwner || authEpoch.current !== epoch) throw Error('Anmeldung inzwischen geändert. Keine lokale Übernahme; bitte erneut prüfen.') }
    return {
      async read() { check(); const value = await backend.read(); check(); return value },
      async inspect() { check(); const value = await backend.inspect(); check(); return value },
      async initialize(...args: Parameters<typeof backend.initialize>) { check(); await backend.initialize(...args); check() },
      async cas(...args: Parameters<typeof backend.cas>) { check(); const value = await backend.cas(...args); check(); return value },
    }
  }
  const available = !!client && !!owner && online && !busy
  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Synchronisierung fehlgeschlagen. Bitte manuell erneut versuchen.') }
    finally { setBusy(false); refresh(value => value + 1) }
  }
  function outcome(result: SyncResult, reload = false) {
    setChoice(null); setConflict(result.kind === 'conflict' ? result.conflict : null)
    if (result.kind === 'synced') {
      setMessage('Synchronisierung abgeschlossen. Neuere lokale Bearbeitungen bleiben als Änderungen sichtbar.')
      if (reload) window.dispatchEvent(new Event(WORKSPACE_EVENT))
    }
  }
  return <section className="cloud-sync" aria-label="Cloud-Synchronisierung">
    <h3>Deine Daten · {status}</h3>
    <p className="kita-help">{workspace ? 'Separater Cloud-Arbeitsbestand. Synchronisierung nur auf Knopfdruck; offline lokal bearbeitbar.' : 'Bisherige lokale Daten bleiben erhalten. Eine Erstübernahme startet nur über den Einrichtungsassistenten mit geprüfter Sicherung und ausdrücklicher Bestätigung.'}</p>
    {workspace && <p className="kita-help">Letzte erfolgreiche Synchronisierung: {new Date(workspace.lastSync).toLocaleString('de-DE')} · Cloud-Version {workspace.revision}</p>}
    {(message || storageError) && <p role="status">{message || storageError}</p>}
    {busy && <p role="status">Synchronisierung wird geprüft …</p>}
    {!workspace && !storageError && !setupOpen && <button className="kita-button secondary" disabled={!available} onClick={() => { setOpening(null); setSetupOpen(true); setMessage('') }}>Cloud mit lokalen Daten einrichten</button>}
    {!workspace && setupOpen && owner && <CloudSetup key={owner} owner={owner} remote={remote} busy={busy} available={available} run={run} onCancel={() => setSetupOpen(false)} onDone={() => { setSetupOpen(false); setMessage('Erstübernahme vollständig zurückgelesen und geprüft. Cloud-Arbeitsbereich geöffnet; Originaldaten und Sicherung bleiben erhalten.') }} />}
    {!workspace && !storageError && !setupOpen && <button className="kita-button" disabled={!available} onClick={() => void run(async () => {
      const source = makeBackup(window.localStorage, owner!, crypto.randomUUID())
      const cloud = await remote().read()
      setOpening(cloud); setOpeningBackup(source); setOpeningProof(null)
    })}>Cloud-Datenbestand öffnen</button>}
    {opening && !workspace && <div className="cloud-confirm" role="group" aria-label="Cloud-Arbeitsbestand öffnen bestätigen">
      <p>Cloud-Version {opening.revision}: {overview(opening.payload)}</p>
      <p>Separaten Cloud-Arbeitsbestand öffnen? Ein bereits lokal zwischengespeicherter Cloud-Bestand einschließlich Offline-Änderungen wird weiterverwendet. Bisherige lokale Daten bleiben unverändert. Offene Formulare werden neu geladen.</p>
      <p>Auch auf einem zweiten Gerät werden lokale Daten nicht übernommen oder ersetzt. Vor dem Wechsel bestehende lokale Daten bitte sichern; offene Formulare werden geschlossen.</p>
      {openingBackup && Object.values(openingBackup.raw).some(value => value !== null) && <BackupCheck key={openingBackup.initializationId} backup={openingBackup} disabled={busy} onVerified={setOpeningProof} />}
      <button className="kita-button" disabled={!available || !!openingBackup && Object.values(openingBackup.raw).some(value => value !== null) && !openingProof} onClick={() => void run(async () => {
        const backend = remote(), latest = await backend.read()
        if (!openingBackup || !equal(captureLocal(window.localStorage), openingBackup.raw)) throw Error('Lokaler Stand inzwischen geändert. Bitte Vorschau neu öffnen und erneut sichern.')
        if (Object.values(openingBackup.raw).some(value => value !== null)) {
          if (!openingProof) throw Error('Bitte gespeicherte lokale Sicherung auswählen.')
          verifyBackupFile(JSON.stringify(openingProof), openingBackup, window.localStorage)
        }
        if (latest.revision !== opening.revision || !equal(latest.payload, opening.payload)) { setOpening(latest); setMessage('Cloud wurde inzwischen geändert. Bitte erneut bestätigen.'); return }
        openWorkspace(window.localStorage, owner!, latest, true); setOpening(null)
        window.dispatchEvent(new Event(WORKSPACE_EVENT))
      })}>Cloud-Arbeitsbestand bestätigt öffnen</button>
      <button className="kita-button secondary" disabled={busy} onClick={() => setOpening(null)}>Abbrechen</button>
    </div>}
    {workspace && <>
      <button className="kita-button" disabled={!available || workspace.owner !== owner || !!conflict} onClick={() => void run(async () => outcome(await synchronize(window.localStorage, owner!, remote())))}>Jetzt synchronisieren</button>
      {!owner && <p className="kita-help">Für die manuelle Synchronisierung bitte anmelden. Offline-Bearbeitungen bleiben auf diesem Gerät.</p>}
      <button className="kita-button secondary" disabled={busy} onClick={() => { if (!window.confirm('Zu bisherigen lokalen Daten wechseln? Nicht gespeicherte Formulare und Vorschläge werden geschlossen; gespeicherte Cloud-Änderungen bleiben auf diesem Gerät erhalten.')) return; leaveWorkspace(); setConflict(null); setChoice(null); setMessage('Bisheriger lokaler Datenbestand geöffnet. Der Cloud-Zwischenstand bleibt lokal gespeichert.') }}>Zu bisherigen lokalen Daten</button>
    </>}
    {workspace && conflict && <div className="cloud-confirm" role="group" aria-label="Synchronisierungskonflikt">
      <h4>Konflikt · Entscheidung erforderlich</h4>
      <p>Keine automatische Zusammenführung. Die gewählte Version ersetzt den anderen Arbeitsstand vollständig; unveränderliche Freigaben dürfen dabei nicht verloren gehen.</p>
      <dl><dt>Lokal · Basis {conflict.revision}</dt><dd>{overview(conflict.local)}</dd><dt>Cloud · Version {conflict.remote.revision}</dt><dd>{overview(conflict.remote.payload)}{conflict.remote.updatedAt && ` · ${new Date(conflict.remote.updatedAt).toLocaleString('de-DE')}`}</dd></dl>
      <p className="kita-help">Abweichende Bereiche: {Object.keys(conflict.local).filter(key => !equal(conflict.local[key], conflict.remote.payload[key])).map(key => key.split(':').slice(-2, -1)[0]).join(', ')}</p>
      <button className="kita-button secondary" disabled={busy} onClick={() => setChoice('local')}>Lokale Version behalten</button>
      <button className="kita-button secondary" disabled={busy} onClick={() => setChoice('cloud')}>Cloud-Version übernehmen</button>
      <button className="kita-button secondary" disabled={busy} onClick={() => { setConflict(null); setChoice(null); setMessage('Abgebrochen. Keine Daten geändert.') }}>Abbrechen</button>
      {choice && <div role="group" aria-label="Übernahme bestätigen">
        <p>{choice === 'local' ? 'Cloud-Arbeitsstand durch die lokale Version ersetzen? Der Cloud-Stand wird erneut geprüft.' : 'Lokalen Cloud-Arbeitsstand ersetzen? Der bisherige lokale Stand wird als Sicherung im Cloud-Zwischenspeicher auf diesem Gerät aufbewahrt. Offene Formulare werden neu geladen.'}</p>
        <button className="kita-button" disabled={!available || workspace.owner !== owner} onClick={() => void run(async () => outcome(await resolveConflict(window.localStorage, owner!, remote(), conflict, choice, true), choice === 'cloud'))}>Übernahme ausdrücklich bestätigen</button>
        <button className="kita-button secondary" disabled={busy} onClick={() => setChoice(null)}>Zurück</button>
      </div>}
    </div>}
    <p className="kita-help">Keine automatische Übertragung beim Wiederverbinden. Abmelden löscht weder lokale Daten noch den Cloud-Zwischenspeicher.</p>
  </section>
}
