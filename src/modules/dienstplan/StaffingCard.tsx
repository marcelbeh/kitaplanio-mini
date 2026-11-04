import { STAFFING_LABELS, criticalWindows, isDefiniteShortage } from './staffing'
import type { StaffingDay } from './staffing'
import { formatMinutes } from './schedule'

export function StaffingCard({ day }: { day: StaffingDay }) {
  const details = criticalWindows(day.windows)
  const shortages = details.filter(isDefiniteShortage).length
  return <div className="staffing-card">
    <span className={`staffing-status staffing-${day.status}`}>{STAFFING_LABELS[day.status]}</span>
    {shortages > 0 && day.status !== 'under' && <small>{shortages} Zeitfenster mit Unterbesetzung</small>}
    <details><summary>Besetzung prüfen</summary>
      <p className="kita-help">{day.note}</p>
      <p className="kita-help">15-Minuten-Raster, zusätzlich an tatsächlichen Wechseln geteilt. Pausen ohne Zeitlage und Halbtage ohne Uhrzeit bleiben ungeklärt. Nettoarbeitszeit steht separat je Schicht und Person.</p>
      {!details.length && day.status === 'matched' && <p>Alle Bereiche entsprechen den eingetragenen Sollvorgaben.</p>}
      <ul className="staffing-windows">{details.map(window => <li key={`${window.area}:${window.start}`}><strong>{formatMinutes(window.start)}–{formatMinutes(window.end)} · {window.name}</strong><span className={`staffing-status staffing-${window.status}`}>{STAFFING_LABELS[window.status]}</span><span>Soll: {window.required ?? 'Nicht konfiguriert'} · Ist: {window.reasons.length ? `ungeklärt · ${window.possible} laut zugeordneten Schichten, davon ${window.actual} ohne bekannte Unklarheit` : window.actual}</span>{window.reasons.map(reason => <small key={reason}>{reason}</small>)}</li>)}</ul>
    </details>
  </div>
}
