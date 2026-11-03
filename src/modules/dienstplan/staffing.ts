import type { KitaSetup, StaffingPeriod } from '../kita/setup'
import type { Employee } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'
import type { Shift } from './schedule'

export type StaffingStatus = 'under' | 'matched' | 'over' | 'check' | 'unconfigured' | 'closed'
export const STAFFING_LABELS: Record<StaffingStatus, string> = { under: '− Unterbesetzt', matched: '= Passend besetzt', over: '+ Überbesetzt', check: '? Prüfen', unconfigured: '— Nicht konfiguriert', closed: '— Geschlossen' }
export type StaffingWindow = { start: number; end: number; area: string; name: string; required: number | null; actual: number; possible: number; status: StaffingStatus; reasons: string[] }
export type StaffingDay = { status: StaffingStatus; windows: StaffingWindow[]; note: string }
const minute = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN
const minimum = (period: StaffingPeriod) => Number.isSafeInteger(period.minimum) && period.minimum >= 1 ? period.minimum : null
export function staffingStatus(required: number | null, actual: number, uncertain: boolean): StaffingStatus {
  if (required === null) return 'unconfigured'
  if (uncertain) return 'check'
  return actual < required ? 'under' : actual > required ? 'over' : 'matched'
}
// Read-only calculation. Quarter-hour grid, additionally split at exact changes; all ranges are [start, end).
export function calculateStaffing(date: string, setup: KitaSetup | null, shifts: Shift[], absences: Absence[], employees: Employee[], dataUnavailable = false): StaffingDay {
  const unknown = (note: string): StaffingDay => ({ status: 'unconfigured', windows: [], note })
  if (!setup?.completed) return unknown('Kita-Einstellungen und Sollvorgaben sind nicht vollständig eingerichtet.')
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]
  // Same backwards-compatible weekday interpretation as KitaPage; no staffing minimum is defaulted.
  if (!(setup.careDays ?? ['mon', 'tue', 'wed', 'thu', 'fri']).some(day => day === weekday)) return { status: 'closed', windows: [], note: 'Kein konfigurierter Öffnungstag.' }
  const opening = minute(setup.opening.start), closing = minute(setup.opening.end)
  const earlyEnd = minute(setup.early.end), lateStart = minute(setup.late.start)
  if (![opening, closing, earlyEnd, lateStart].every(Number.isFinite) || opening >= earlyEnd || earlyEnd >= lateStart || lateStart >= closing || minute(setup.early.start) !== opening || minute(setup.late.end) !== closing || !setup.groups.length) return unknown('Öffnungszeiten oder Betreuungsbereiche sind nicht vollständig konfiguriert.')
  const dayShifts = shifts.filter(shift => shift.date === date)
  const dayAbsences = absences.filter(absence => absence.startDate <= date && absence.endDate >= date)
  const boundaries = new Set([opening, closing, earlyEnd, lateStart])
  for (let point = Math.floor(opening / 15) * 15 + 15; point < closing; point += 15) boundaries.add(point)
  for (const shift of dayShifts) for (const time of [shift.start, shift.end]) { const point = minute(time); if (point > opening && point < closing) boundaries.add(point) }
  for (const group of setup.groups) for (const period of group.periods) for (const time of [period.start, period.end]) { const point = minute(time); if (point > opening && point < closing) boundaries.add(point) }
  const points = [...boundaries].sort((a, b) => a - b)
  const windows: StaffingWindow[] = []
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index], end = points[index + 1]
    const shared = start < earlyEnd ? setup.early : start >= lateStart ? setup.late : null
    const areas = shared ? [{ id: start < earlyEnd ? 'early' : 'late', name: start < earlyEnd ? 'Frühbetreuung · gemeinsam' : 'Spätbetreuung · gemeinsam', periods: [shared] }] : setup.groups.map(group => ({ ...group, id: `group:${group.id}` }))
    const active = dayShifts.filter(shift => minute(shift.start) <= start && minute(shift.end) >= end)
    const persons = new Map<string, Shift[]>()
    for (const shift of active) persons.set(shift.employeeId, [...(persons.get(shift.employeeId) ?? []), shift])
    for (const area of areas) {
      const periods = area.periods.filter(period => minute(period.start) <= start && minute(period.end) >= end)
      const required = periods.length === 1 ? minimum(periods[0]) : null
      let actual = 0, possible = 0
      const reasons = new Set<string>()
      if (dataUnavailable) reasons.add('Mitarbeiter-, Schicht- oder Abwesenheitsdaten nicht vollständig verfügbar')
      for (const [id, assignments] of persons) {
        if (!shared && !assignments.some(shift => `group:${shift.groupId}` === area.id)) continue
        const away = dayAbsences.filter(absence => absence.employeeId === id)
        if (away.some(absence => absence.portion === 'full')) continue
        const unclear: string[] = []
        if (away.length) unclear.push('Halbtagsabwesenheit ohne Uhrzeit')
        if (assignments.some(shift => (shift.breakMinutes ?? 0) > 0)) unclear.push('Pause ohne zeitliche Zuordnung')
        if (!employees.some(person => person.id === id)) unclear.push('Mitarbeiter nicht mehr in den Stammdaten')
        if (!shared && new Set(assignments.map(shift => shift.groupId)).size > 1) unclear.push('Gleichzeitige Zuordnung zu mehreren Gruppen')
        possible++
        if (!unclear.length) actual++
        unclear.forEach(reason => reasons.add(reason))
      }
      // Orphan group references cannot safely be allocated to any configured core group.
      if (!shared && active.some(shift => !setup.groups.some(group => group.id === shift.groupId) && !dayAbsences.some(absence => absence.employeeId === shift.employeeId && absence.portion === 'full'))) reasons.add('Schicht mit nicht mehr vorhandener Gruppe – Zuordnung prüfen')
      windows.push({ start, end, area: area.id, name: area.name, required, actual, possible, reasons: [...reasons], status: staffingStatus(required, actual, reasons.size > 0) })
    }
  }
  const status = (['unconfigured', 'check', 'under', 'over', 'matched'] as const).find(status => windows.some(window => window.status === status)) ?? 'unconfigured'
  return { status, windows, note: 'Vergleich mit den eigenen Kita-Sollvorgaben; keine gesetzliche Personalbewertung.' }
}
// Compact detail windows instead of showing every quarter-hour as a table.
export function criticalWindows(windows: StaffingWindow[]): StaffingWindow[] {
  const result: StaffingWindow[] = []
  const sorted = windows.filter(window => window.status !== 'matched').sort((a, b) => a.area.localeCompare(b.area) || a.start - b.start)
  for (const window of sorted) {
    const last = result[result.length - 1]
    if (last && last.area === window.area && last.end === window.start && last.status === window.status && last.required === window.required && last.actual === window.actual && last.possible === window.possible && last.reasons.join() === window.reasons.join()) last.end = window.end
    else result.push({ ...window })
  }
  return result.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name, 'de'))
}
