import { useState } from 'react'
import { appStorage } from '../../cloud/workspace'
import { addDays, calendarWeek, dateLabel, formatMinutes, workTime } from './schedule'
import { adoptWeekCopy, prepareWeekCopy } from './copyWeek'
import type { WeekCopy } from './copyWeek'

type Props = { date: string; unavailable: boolean; onDone: (date: string, count: number, skipped: number) => void }
export function CopyWeekPanel({ date, unavailable, onDone }: Props) {
  const [open, setOpen] = useState(false), [source, setSource] = useState(date), [target, setTarget] = useState(() => addDays(date, 7))
  const [preview, setPreview] = useState<WeekCopy | null>(null), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('')
  const hard = preview?.issues.filter(issue => issue.kind === 'conflict').length ?? 0
  function reset() { setPreview(null); setConfirmed(false); setError('') }
  return <section className="kita-card employee-page plan-checks" aria-label="Woche kopieren">
    <button className="kita-button secondary" disabled={unavailable} aria-expanded={open} onClick={() => { reset(); setOpen(!open) }}>Woche kopieren</button>
    {open && <>
      <p>Überträgt gespeicherte Schichten des aktuellen Arbeitsplans für alle Mitarbeitenden und Gruppen, unabhängig vom Ansichtsfilter. Keine Termine, Abwesenheiten oder Freigaben werden kopiert. Bestehende Zielschichten bleiben unverändert; veröffentlichte Zielwochen sind gesperrt.</p>
      <div className="employee-grid"><label>Datum in der Quellwoche<input type="date" min="0002-01-01" max="9998-12-31" value={source} onChange={event => { setSource(event.target.value); reset() }} /></label><label>Datum in der Zielwoche<input type="date" min="0002-01-01" max="9998-12-31" value={target} onChange={event => { setTarget(event.target.value); reset() }} /></label></div>
      <button className="kita-button secondary" onClick={() => { reset(); try { setPreview(prepareWeekCopy(appStorage, source, target)) } catch (error) { setError((error as Error).message) } }}>Kopiervorschau prüfen</button>
      {error && <p className="kita-errors" role="alert">{error}</p>}
      {preview && <>
        <p><strong>Quelle KW {calendarWeek(preview.source).week}/{calendarWeek(preview.source).year}:</strong> {dateLabel(preview.source)}–{dateLabel(addDays(preview.source, 6))}<br /><strong>Ziel KW {calendarWeek(preview.target).week}/{calendarWeek(preview.target).year}:</strong> {dateLabel(preview.target)}–{dateLabel(addDays(preview.target, 6))}</p>
        <p role="status"><strong>{preview.shifts.length} übernehmen · {preview.skipped.length} überspringen</strong> · {formatMinutes(workTime(preview.shifts).net)} neue Nettozeit</p>
        <details><summary>Übertragbare Schichten anzeigen</summary><ul className="plan-issues">{preview.shifts.map(shift => <li key={shift.id}>{shift.employeeName} · {dateLabel(shift.date, true)} · {shift.start}–{shift.end} · Pause {shift.breakMinutes === undefined ? 'nicht erfasst' : formatMinutes(shift.breakMinutes)}</li>)}</ul></details>
        {!!preview.skipped.length && <details open><summary>Übersprungene Schichten prüfen</summary><ul className="plan-issues">{preview.skipped.map(item => <li className="plan-hint plan-issue" key={item.source.id}><strong>{item.source.employeeName || item.source.employeeId} · {dateLabel(item.date, true)} · {item.source.start}–{item.source.end}</strong>{item.reasons.map(reason => <span key={reason}>{reason}</span>)}</li>)}</ul></details>}
        <p className="kita-help">Zielplan nach Kopieren: {hard} harte Konflikte · {preview.issues.length - hard} Hinweise. Bestehende Konflikte und offene Personalbedarfe werden nicht automatisch behoben. Unklare Pausen und Wochenstunden bleiben zur Prüfung sichtbar; eine Kopie ist keine Freigabe.</p>
        {!!preview.issues.length && <details><summary>Prüfung des kombinierten Zielplans</summary><ul className="plan-issues">{preview.issues.map(issue => <li className={`plan-issue plan-${issue.kind}`} key={issue.id}><strong>{issue.kind === 'conflict' ? 'Konflikt' : 'Hinweis'} · {dateLabel(issue.date)} · {issue.person}</strong><span>{issue.cause}</span><small>{issue.correction}</small></li>)}</ul></details>}
        <label className="employee-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> Ich habe Zielwoche, übertragbare/übersprungene Schichten und verbleibende Prüfmeldungen geprüft. Nur die angezeigten neuen Schichten hinzufügen.</label>
        <div className="kita-actions"><button className="kita-button" disabled={!confirmed || !preview.shifts.length} onClick={() => {
          try { const count = adoptWeekCopy(appStorage, preview, confirmed); setOpen(false); reset(); onDone(preview.target, count, preview.skipped.length) }
          catch (error) { setError((error as Error).message); setConfirmed(false) }
        }}>Bestätigte Kopie speichern</button><button className="kita-button secondary" onClick={() => { setOpen(false); reset() }}>Abbrechen</button></div>
      </>}
    </>}
  </section>
}
