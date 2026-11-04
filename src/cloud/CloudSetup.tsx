import { useState } from 'react'
import { AREAS, equal } from './dataset'
import { areaPreview, captureLocal, downloadBackup, firstImport, importPayload, makeBackup, readBackup, verifyBackupFile } from './firstImport'
import type { LocalBackup } from './firstImport'
import type { SetupRemote, CloudStatus } from './sync'
import { WORKSPACE_EVENT } from './workspace'

export function BackupCheck({ backup, disabled, onVerified }: { backup: LocalBackup; disabled: boolean; onVerified: (value: LocalBackup | null) => void }) {
  const [downloaded, setDownloaded] = useState(false), [message, setMessage] = useState('')
  return <div role="group" aria-label="Lokale Sicherung prüfen">
    <p>1. Vollständige JSON-Sicherung herunterladen. Sie enthält personenbezogene App-Daten: bitte privat und sicher aufbewahren. Es wird keine bestehende Sicherung gelöscht.</p>
    <button className="kita-button secondary" disabled={disabled} onClick={() => {
      onVerified(null); setDownloaded(false)
      try { downloadBackup(backup); setDownloaded(true); setMessage('Datei speichern und danach hier erneut auswählen. Auf dem iPhone bei Bedarf in „Dateien“ sichern.') }
      catch { setMessage('Download konnte nicht gestartet werden. Keine Übernahme möglich; bitte erneut versuchen.') }
    }}>JSON-Backup herunterladen</button>
    <label>2. Gespeicherte Sicherung zur Prüfung auswählen<input type="file" accept=".json,application/json" disabled={disabled || !downloaded} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''; onVerified(null)
      if (!file) return
      void file.text().then(text => { onVerified(verifyBackupFile(text, backup, window.localStorage)); setMessage('Gespeicherte Sicherung vollständig geprüft.') }).catch(() => { setMessage('Sicherung stimmt nicht mit der Vorschau bzw. dem aktuellen lokalen Stand überein. Bitte neu prüfen und sichern.') })
    }} /></label>
    {message && <p role="status">{message}</p>}
  </div>
}
export function CloudSetup({ owner, remote, busy, available, run, onDone, onCancel }: { owner: string; remote: () => SetupRemote; busy: boolean; available: boolean; run: (action: () => Promise<void>) => Promise<void>; onDone: () => void; onCancel: () => void }) {
  const [backup, setBackup] = useState<LocalBackup | null>(null), [proof, setProof] = useState<LocalBackup | null>(null)
  const [status, setStatus] = useState<CloudStatus | null>(null), [confirmed, setConfirmed] = useState(false)
  let validation = ''
  if (backup) { try { importPayload(backup.raw) } catch (error) { validation = (error as Error).message } }
  const blocked = status?.kind === 'occupied' || status?.kind === 'ready' && status.initializationId !== backup?.initializationId
  async function prepare(recovery?: LocalBackup) {
    const source = recovery ?? makeBackup(window.localStorage, owner, crypto.randomUUID())
    if (!equal(captureLocal(window.localStorage), source.raw)) throw Error('Lokaler Stand stimmt nicht mit der Sicherung überein. Keine Wiederaufnahme; Originaldaten bleiben erhalten.')
    setBackup(source); setProof(null); setConfirmed(false); setStatus(null)
    setStatus(await remote().inspect())
  }
  return <section className="cloud-confirm" aria-label="Cloud-Ersteinrichtung">
    <h4>Lokale Daten sicher übernehmen</h4>
    <p>Nur gespeicherte Daten werden übernommen. Offene Formulare bitte vorher speichern. Keine automatische Übertragung, Zusammenführung oder Löschung. Nach Erfolg wird der getrennte Cloud-Arbeitsbereich geöffnet; ursprüngliche lokale Daten bleiben erhalten.</p>
    <button className="kita-button secondary" disabled={!available} onClick={() => void run(() => prepare())}>Vorschau und Cloud-Status prüfen</button>
    <label>Nach Unterbrechung: ursprüngliche Sicherung auswählen<input type="file" accept=".json,application/json" disabled={!available} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (file) void run(async () => { await prepare(readBackup(await file.text(), owner)) })
    }} /></label>
    {backup && <>
      <ul>{areaPreview(backup.raw).map(area => <li key={area.name}>{area.name}: {area.detail}</li>)}</ul>
      <p role="status">Cloud: {status ? status.kind === 'empty' ? 'Leer und noch nicht eingerichtet' : status.kind === 'occupied' ? 'Enthält bereits Daten · Übernahme gesperrt' : status.initializationId === backup.initializationId ? 'Diese Übernahme wurde bereits gespeichert · Rückprüfung möglich' : 'Bereits eingerichtet · keine Erstübernahme möglich' : 'Noch nicht geprüft'}</p>
      {validation && <p role="alert">{validation}</p>}
      {AREAS.some(key => backup.raw[key] === null) && <p>Warnung: Nicht vorhandene optionale Bereiche bleiben ausdrücklich nicht vorhanden (null). Es werden keine leeren Listen, Regeln oder Datensätze ergänzt. Kita und Mitarbeiterbereich müssen gültig gespeichert sein.</p>}
      {blocked && <p>Vorgang gestoppt. Bitte abbrechen und den vorhandenen Cloud-Bestand öffnen. Die lokalen Daten können zuvor separat gesichert werden. Es wird nichts überschrieben.</p>}
      <BackupCheck key={backup.initializationId} backup={backup} disabled={busy} onVerified={value => { setProof(value); setConfirmed(false) }} />
      <label className="employee-check"><input type="checkbox" disabled={busy || !proof || !!validation || !!blocked || !status} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Ich habe die Sicherung geprüft und bestätige die einmalige Übernahme dieses vollständigen Bestands einschließlich der angezeigten nicht vorhandenen Bereiche. Die Originaldaten bleiben lokal erhalten.</label>
      <button className="kita-button" disabled={!available || !proof || !confirmed || !!validation || !!blocked || !status} onClick={() => void run(async () => {
        await firstImport(window.localStorage, remote(), backup, proof, confirmed)
        onDone(); window.dispatchEvent(new Event(WORKSPACE_EVENT))
      })}>Erstübernahme bestätigt starten / Stand erneut prüfen</button>
    </>}
    <button className="kita-button secondary" disabled={busy} onClick={onCancel}>Abbrechen</button>
  </section>
}
