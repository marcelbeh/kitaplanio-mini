import { useState } from 'react'
import type { CheckOptions, PlanIssue } from './checks'
import { dateLabel } from './schedule'

export function PlanChecks({ issues, options, onOptions, onSelect, onSaveOptions, limitsLocked, rulesMessage }: { issues: PlanIssue[]; options: CheckOptions; onOptions: (value: CheckOptions) => void; onSelect: (date: string) => void; onSaveOptions?: () => void; limitsLocked?: boolean; rulesMessage?: string }) {
  const [filter, setFilter] = useState<'all' | 'conflict' | 'hint'>('all')
  const conflicts = issues.filter(issue => issue.kind === 'conflict').length
  const visible = issues.filter(issue => filter === 'all' || issue.kind === filter)
  const invalid = Object.values(options).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 1))
  return <section className="kita-card plan-checks" aria-label="Regel- und Konfliktprüfung">
    <h2>Planprüfung</h2><p role="status">{conflicts} Konflikte · {issues.length - conflicts} Hinweise · aktuelle Kalenderwoche (Mo–So)</p>
    <details><summary>Prüfergebnisse und optionale Grenzen</summary>
      <p className="kita-help">Die Prüfung ändert keine Schichten. Grundlage sind eingetragene Daten und eigene Vorgaben, keine pauschale Rechtsbewertung. Nicht konfigurierte Schwellen werden übersprungen.</p>
      <div className="schedule-check-options">
        <label>Langer Dienst: Grenze in Bruttominuten<input type="number" disabled={limitsLocked} min="1" step="1" inputMode="numeric" value={options.maxShiftMinutes ?? ''} onChange={event => onOptions({ ...options, maxShiftMinutes: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
        <label>Ruheabstand: mindestens Minuten<input type="number" disabled={limitsLocked} min="1" step="1" inputMode="numeric" value={options.minRestMinutes ?? ''} onChange={event => onOptions({ ...options, minRestMinutes: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
      </div>
      <p className="kita-help">Optional; der Generator verwendet die ausdrücklich gespeicherten Grenzen. Leere Felder: keine Prüfung langer Dienste bzw. kurzer Ruheabstände. Ruheabstände verwenden Kalenderzeiten ohne Zeitzonenregel; Dienstverteilung vergleicht belegte Tage derselben Person.</p>
      <button className="kita-button secondary" disabled={invalid || limitsLocked} onClick={onSaveOptions}>Grenzen dauerhaft speichern</button>
      {limitsLocked && <p className="kita-help">Grenzen erst nach Verwerfen oder Übernahme der Vorschau ändern.</p>}
      {rulesMessage && <p role="status" className="kita-help">{rulesMessage}</p>}
      {invalid && <p className="kita-errors" role="alert">Bitte positive ganze Minuten eingeben. Ungültige Schwellen werden nicht angewendet.</p>}
      <div className="kita-actions" role="group" aria-label="Prüfergebnisse filtern">{([['all', 'Alle'], ['conflict', 'Konflikte'], ['hint', 'Hinweise']] as const).map(([value, label]) => <button key={value} className="kita-button secondary" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
      {!visible.length && <p>Keine Meldungen für diesen Filter. Nicht prüfbare Regeln sind damit nicht bestätigt.</p>}
      <ul className="plan-issues">{visible.map(issue => <li key={issue.id} className={`plan-issue plan-${issue.kind}`}><strong>{issue.kind === 'conflict' ? '! Konflikt' : '? Hinweis'} · {issue.person}</strong><button className="schedule-edit" onClick={() => onSelect(issue.date)}>Zum Tag {dateLabel(issue.date)}</button><p>{issue.cause}</p><small>Mögliche Korrektur: {issue.correction}</small></li>)}</ul>
    </details>
  </section>
}
