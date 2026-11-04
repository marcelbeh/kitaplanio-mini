import type { PlanIssue } from './checks'
import type { Shift } from './schedule'
import type { Absence } from '../abwesenheiten/absences'
import type { Occurrence } from '../termine/events'
import type { StaffingDay } from './staffing'
import { STAFFING_LABELS } from './staffing'
import { dateLabel } from './schedule'
import { cockpitTasks, planningTask } from './cockpit'

export function WeekCockpit({ days, selected, shifts, absences, occurrences, issues, staffing, preview, unavailable, onDay, onIssue, onChecks, onPublication, onPrint }: {
  days: string[]; selected: string; shifts: Shift[]; absences: Absence[]; occurrences: Occurrence[]; issues: PlanIssue[];
  staffing: (date: string) => StaffingDay; preview: boolean; unavailable: boolean;
  onDay: (date: string) => void; onIssue: (issue: PlanIssue) => void; onChecks: () => void; onPublication: () => void; onPrint: () => void;
}) {
  const hard = issues.filter(issue => issue.kind === 'conflict').length
  const tasks = cockpitTasks(issues)
  return <section className="kita-card week-cockpit" aria-label="Dienstplan-Cockpit">
    <div className="cockpit-heading"><div><h2>Dienstplan-Cockpit</h2><p>{preview ? 'Ungespeicherte Generatorvorschau' : 'Aktueller Arbeitsplan'} · gesamtes Team</p></div><div className="kita-actions"><button className="kita-button secondary" disabled={preview} onClick={onPublication}>Zur Freigabe</button><button className="kita-button secondary" disabled={preview} onClick={onPrint}>Zu PDF / Druck</button></div></div>
    <p role="status"><strong>{hard} Konflikte</strong> · {issues.length - hard} Hinweise</p>
    {unavailable && <p className="kita-errors" role="alert">Daten unvollständig: Die Übersicht ist nicht abschließend prüfbar. Bitte zuerst die angezeigten Speicherprobleme klären.</p>}
    {preview && <p className="kita-help">Freigabe und Druck sind nach Übernahme oder Verwerfen der Vorschau erreichbar. Bestehende Dienste bleiben in der Vorschau fixiert.</p>}
    <div className="cockpit-days" role="group" aria-label="Tagesstatus dieser Woche">{days.map(date => {
      const day = staffing(date), planned = new Set(shifts.filter(shift => shift.date === date).map(shift => shift.employeeId)).size
      const absent = new Set(absences.filter(absence => absence.startDate <= date && absence.endDate >= date).map(absence => absence.employeeId)).size
      const messages = issues.filter(issue => issue.date === date)
      return <button className="cockpit-day" key={date} aria-pressed={selected === date} onClick={() => onDay(date)}>
        <strong>{dateLabel(date, true)}</strong><span className={`staffing-status staffing-${day.status}`}>{STAFFING_LABELS[day.status]}</span><span>{planned} Mitarbeitende geplant · {absent} mit Abwesenheit</span><span>{messages.filter(issue => issue.kind === 'conflict').length} Konflikte · {messages.filter(issue => issue.kind === 'hint').length} Hinweise</span>{occurrences.some(item => item.date === date) && <span>{occurrences.filter(item => item.date === date).length} Sondertermine</span>}
      </button>
    })}</div>
    <p className="kita-help">Die Ampeln gelten für das gesamte Team. Wochenbezogene Hinweise stehen am Wochenanfang; fehlende Vorgaben werden durch eine leere Meldungsliste nicht bestätigt.</p>
    <div className="cockpit-heading"><h3>Offene Aufgaben</h3><button className="kita-button secondary" onClick={onChecks}>Zur vollständigen Planprüfung</button></div>
    {!tasks.length && <p>{unavailable ? 'Keine verlässliche Aufgabenliste verfügbar.' : 'Keine offenen Prüfmeldungen. Das bestätigt keine nicht konfigurierten Vorgaben.'}</p>}
    <ul className="cockpit-tasks">{tasks.map(issue => <li key={issue.id}><button onClick={() => onIssue(issue)}><strong>{issue.kind === 'conflict' ? '! Konflikt' : '? Hinweis'} · {planningTask(issue)}</strong><span>{issue.person} · {dateLabel(issue.date)}</span><span>{issue.cause}</span><small>Nächster Schritt: {issue.correction}</small><span className="schedule-edit-hint">Betroffenen Dienst / Tag öffnen ↗</span></button></li>)}</ul>
    {issues.length > tasks.length && <p className="kita-help">{tasks.length} von {issues.length} Meldungen angezeigt; alle Meldungen und Filter findest du in der Planprüfung.</p>}
  </section>
}
