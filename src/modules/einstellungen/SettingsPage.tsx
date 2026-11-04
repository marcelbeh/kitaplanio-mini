import { buildDemo, demoAvailability, loadDemo } from './demo'
import { calendarWeek, dateLabel, localDate } from '../dienstplan/schedule'
import { useState } from 'react'
import { AREAS } from '../../cloud/dataset'
import { ACTIVE_KEY, WORKSPACE_EVENT } from '../../cloud/workspace'
import { prepareReset, RESET_PHRASE, resetLocalApp, verifyResetBackup } from './reset'
import type { ResetBackup } from './reset'

export function SettingsPage() {
  const [backup, setBackup] = useState<ResetBackup | null>(null), [proof, setProof] = useState<ResetBackup | null>(null)
  const [downloaded, setDownloaded] = useState(false), [phrase, setPhrase] = useState(''), [message, setMessage] = useState('')
  const [demoOpen, setDemoOpen] = useState(false), [demoDate, setDemoDate] = useState(localDate)
  let demoError = ''
  try { demoAvailability(window.localStorage) } catch (error) { demoError = (error as Error).message }
  const demoWeek = calendarWeek(demoDate)
  let blocked = true, storageError = false
  try { blocked = window.localStorage.getItem(ACTIVE_KEY) !== null } catch { storageError = true }
  function prepare() {
    setDemoOpen(false); setProof(null); setPhrase(''); setDownloaded(false); setMessage(''); setBackup(null)
    try { setBackup(prepareReset(window.localStorage)) } catch (error) { setMessage((error as Error).message) }
  }
  function download() {
    if (!backup) return
    setProof(null); setDownloaded(false); setPhrase('')
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url; link.download = `caro-reset-backup-${backup.createdAt.replaceAll(':', '-')}-${crypto.randomUUID()}.json`
      try { document.body.append(link); link.click(); setDownloaded(true); setMessage('Datei sicher speichern und anschließend hier zur Prüfung auswählen.') }
      finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000) }
    } catch { setMessage('Download konnte nicht gestartet werden. Kein Reset möglich; bitte erneut versuchen.') }
  }
  return <>
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Einstellungen</h1><p>Deine lokalen App-Daten verwalten.</p></div>
    <section className="kita-setup employee-page" aria-label="Datenverwaltung">
      <div className="kita-card"><h2>Datenverwaltung</h2><h3>Lokale App zurücksetzen</h3>
        <p>Kita, Gruppen, Mitarbeitende, Schichten, Abwesenheiten, Sondertermine, Regeln, Einrichtungs-Zwischenstand und veröffentlichte Wochenversionen werden aus dem bisherigen lokalen Bestand entfernt. Anschließend startet die Einrichtung neu.</p>
        <p>Cloud-Bestände und ihre lokalen Zwischenspeicher, Anmeldung und fremde Browserdaten bleiben erhalten. Es wird nichts synchronisiert. Die Sicherung enthält sämtliche sieben zu löschenden App-Bereiche als unveränderte Originalwerte, auch bei beschädigten Daten.</p>
        {blocked && <p role="alert">{storageError ? 'Speicher nicht zugänglich. Reset gesperrt.' : 'Cloud-Arbeitsbereich aktiv: Reset gesperrt. Zuerst oben im Cloud-Menü „Zu bisherigen lokalen Daten“ wählen und den Wechsel bestätigen.'}</p>}
        {message && <p role="status">{message}</p>}
        {!blocked && <button className="kita-button secondary" onClick={prepare}>Lokale App zurücksetzen</button>}
        {!blocked && backup && <div role="group" aria-label="Lokalen Reset bestätigen">
          <p>{AREAS.filter(key => backup.raw[key] !== null).length} von 7 lokalen Datenbereichen gespeichert. Der Reset kann nicht rückgängig gemacht werden. Bitte Sicherung privat aufbewahren; sie enthält personenbezogene Daten. Es werden keine bestehenden Sicherungen gelöscht. Gerätelokale Vorlagen gehören nicht zu diesen sieben Bereichen und bleiben beim Reset erhalten. Diese Datei ist eine Reset-Sicherung; es gibt derzeit keinen allgemeinen Wiederherstellungsdialog.</p>
          <button className="kita-button secondary" onClick={download}>JSON-Backup der sieben Datenbereiche herunterladen</button>
          <label>Gespeicherte Sicherung zur Prüfung auswählen<input type="file" accept=".json,application/json" disabled={!downloaded} onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; setProof(null); setPhrase('')
            if (file) void file.text().then(text => { setProof(verifyResetBackup(text, backup)); setMessage('Gespeicherte Sicherung geprüft. Jetzt den Reset ausdrücklich bestätigen.') }).catch(() => setMessage('Sicherung stimmt nicht mit der Vorschau überein. Kein Reset möglich.'))
          }} /></label>
          <label>Zur Bestätigung „{RESET_PHRASE}“ eingeben<input type="text" autoComplete="off" spellCheck={false} value={phrase} disabled={!proof} onChange={event => setPhrase(event.target.value)} /></label>
          <div className="kita-actions"><button className="kita-button" disabled={!proof || phrase !== RESET_PHRASE} onClick={() => {
            try {
              resetLocalApp(window.localStorage, backup, proof, phrase)
              window.location.hash = '#kita'; window.dispatchEvent(new Event(WORKSPACE_EVENT))
            } catch (error) { setMessage((error as Error).message); setProof(null); setPhrase('') }
          }}>Lokale Daten endgültig zurücksetzen</button><button className="kita-button secondary" onClick={() => { setBackup(null); setProof(null); setPhrase(''); setMessage('Reset abgebrochen. Keine Daten geändert.') }}>Abbrechen</button></div>
        </div>}
      </div>
      <div className="kita-card"><h3>DEMO · Kita zum Ausprobieren</h3>
        <p>11 fiktive Mitarbeitende: Nest (3), Sonne (4), Sterne (4). Montag bis Freitag 07:00–16:00 Uhr, mit unterschiedlichen Wochenstunden, Pausen, Abwesenheiten und Sonderterminen. Keine reguläre Wochenendbetreuung; ein Sonntags-Gottesdienst bleibt ein Sondertermin ohne automatisch geplante Schichten.</p>
        <p>Nur für einen nachweislich leeren lokalen Bestand. Keine Cloud-Übertragung. Die Demo lässt sich über den lokalen Reset vollständig entfernen.</p>
        {demoError && <p className="kita-help">{demoError}</p>}
        <button className="kita-button secondary" disabled={!!demoError} onClick={() => {
          try { demoAvailability(window.localStorage); const date = localDate(); buildDemo(date); setDemoDate(date); setDemoOpen(true); setBackup(null); setProof(null); setMessage('') }
          catch (error) { setMessage((error as Error).message) }
        }}>Demo-Kita laden</button>
        {demoOpen && <div role="group" aria-label="Demo-Kita bestätigen">
          <p>DEMO für KW {demoWeek.week}/{demoWeek.year}: {dateLabel(demoWeek.monday)}–{dateLabel(demoWeek.days[4])}. Kirchlicher Sondertermin am {dateLabel(demoWeek.days[6])}. Alle Personen und Sollwerte sind fiktiv; Pausenlage und halbtägige Abwesenheit bleiben sichtbar ungeklärt. Abwesenheiten erzeugen bewusst Prüfhinweise und mögliche Bedarfslücken.</p>
          <div className="kita-actions"><button className="kita-button" disabled={!!demoError} onClick={() => {
            try { loadDemo(window.localStorage, demoDate, true); window.location.hash = '#dienstplan'; window.dispatchEvent(new Event(WORKSPACE_EVENT)) }
            catch (error) { setMessage((error as Error).message); setDemoOpen(false) }
          }}>DEMO ausdrücklich lokal laden</button><button className="kita-button secondary" onClick={() => setDemoOpen(false)}>Abbrechen</button></div>
        </div>}
      </div>
    </section>
  </>
}
