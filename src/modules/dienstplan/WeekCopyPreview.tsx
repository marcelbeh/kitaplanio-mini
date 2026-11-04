import { addDays, calendarWeek, dateLabel, formatMinutes, workTime } from './schedule'
import type { WeekCopy } from './copyWeek'

type Props = { preview: WeekCopy; confirmed: boolean; onConfirmed: (value: boolean) => void; onApply: () => void; onCancel: () => void; sourceLabel?: string; applyLabel?: string }
export function WeekCopyPreview({ preview, confirmed, onConfirmed, onApply, onCancel, sourceLabel, applyLabel = 'Bestätigte Kopie speichern' }: Props) {
  const hard = preview.issues.filter(issue => issue.kind === 'conflict').length
  return <>
        <p>{sourceLabel ? <><strong>Vorlage: {sourceLabel}</strong> · ohne feste Kalenderdaten</> : <><strong>Quelle KW {calendarWeek(preview.source).week}/{calendarWeek(preview.source).year}:</strong> {dateLabel(preview.source)}–{dateLabel(addDays(preview.source, 6))}</>}<br /><strong>Ziel KW {calendarWeek(preview.target).week}/{calendarWeek(preview.target).year}:</strong> {dateLabel(preview.target)}–{dateLabel(addDays(preview.target, 6))}</p>
        <p role="status"><strong>{preview.shifts.length} übernehmen · {preview.skipped.length} überspringen</strong> · {formatMinutes(workTime(preview.shifts).net)} neue Nettozeit</p>
        <details><summary>Übertragbare Schichten anzeigen</summary><ul className="plan-issues">{preview.shifts.map(shift => <li key={shift.id}>{shift.employeeName} · {dateLabel(shift.date, true)} · {shift.start}–{shift.end} · Pause {shift.breakMinutes === undefined ? 'nicht erfasst' : formatMinutes(shift.breakMinutes)}</li>)}</ul></details>
        {!!preview.skipped.length && <details open><summary>Übersprungene Schichten prüfen</summary><ul className="plan-issues">{preview.skipped.map(item => <li className="plan-hint plan-issue" key={item.source.id}><strong>{item.source.employeeName || item.source.employeeId} · {dateLabel(item.date, true)} · {item.source.start}–{item.source.end}</strong>{item.reasons.map(reason => <span key={reason}>{reason}</span>)}</li>)}</ul></details>}
        <p className="kita-help">Zielplan nach Übernahme: {hard} harte Konflikte · {preview.issues.length - hard} Hinweise. Bestehende Konflikte und offene Personalbedarfe werden nicht automatisch behoben. Unklare Pausen und Wochenstunden bleiben zur Prüfung sichtbar; eine Kopie ist keine Freigabe.</p>
        {!!preview.issues.length && <details><summary>Prüfung des kombinierten Zielplans</summary><ul className="plan-issues">{preview.issues.map(issue => <li className={`plan-issue plan-${issue.kind}`} key={issue.id}><strong>{issue.kind === 'conflict' ? 'Konflikt' : 'Hinweis'} · {dateLabel(issue.date)} · {issue.person}</strong><span>{issue.cause}</span><small>{issue.correction}</small></li>)}</ul></details>}
        <label className="employee-check"><input type="checkbox" checked={confirmed} onChange={event => onConfirmed(event.target.checked)} /> Ich habe Zielwoche, übertragbare/übersprungene Schichten und verbleibende Prüfmeldungen geprüft. Nur die angezeigten neuen Schichten hinzufügen.</label>
    <div className="kita-actions"><button className="kita-button" disabled={!confirmed || !preview.shifts.length} onClick={onApply}>{applyLabel}</button><button className="kita-button secondary" onClick={onCancel}>Abbrechen</button></div>
  </>
}
