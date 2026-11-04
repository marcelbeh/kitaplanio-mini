import { loadSetup } from '../kita/setup'
import type { KitaSetup, StorageAccess } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'
import type { Employee } from '../mitarbeiter/employees'
import { loadAbsences } from '../abwesenheiten/absences'
import type { Absence } from '../abwesenheiten/absences'
import { addDays, calendarWeek, schedulePeople, validDate } from '../dienstplan/schedule'
import { loadShifts } from '../dienstplan/schedule'
import type { Shift } from '../dienstplan/schedule'
import { dutyCounts, fairnessReport } from '../dienstplan/fairness'
import { netTimeProblem, shiftPeriods } from '../dienstplan/presentation'
import { monthBounds, moveMonth } from '../dienstplan/month'

export type PeriodMode = 'week' | 'month'
export type SortKey = 'name' | 'net' | 'early' | 'core' | 'late' | 'weekend'
type Domain = 'setup' | 'employees' | 'shifts' | 'absences'
export type AnalyticsData = { setup: KitaSetup | null; employees: Employee[]; shifts: Shift[]; absences: Absence[]; unavailable?: Partial<Record<Domain, boolean>>; errors?: string[] }
export function readAnalyticsData(storage: StorageAccess): AnalyticsData {
  const unavailable: Partial<Record<Domain, boolean>> = {}, errors: string[] = []
  function read<T>(domain: Domain, label: string, load: () => T, fallback: T): T {
    try { return load() } catch { unavailable[domain] = true; errors.push(`${label} konnten nicht geladen werden. Betroffene Kennzahlen bleiben ungeklärt; bitte Daten prüfen und neu laden.`); return fallback }
  }
  return {
    setup: read('setup', 'Kita-Einstellungen', () => loadSetup(storage), null),
    employees: read('employees', 'Mitarbeiterdaten', () => loadEmployees(storage).employees, []),
    shifts: read('shifts', 'Schichten', () => loadShifts(storage), []),
    absences: read('absences', 'Abwesenheiten', () => loadAbsences(storage).absences, []), unavailable, errors,
  }
}
export function reportRange(mode: PeriodMode, date: string) {
  if (!validDate(date) || date < '0002-01-01' || date > '9998-12-31') throw Error('Bitte ein gültiges Datum zwischen 0002 und 9998 auswählen.')
  if (mode === 'month') return monthBounds(date)
  const week = calendarWeek(date)
  if (week.monday < '0002-01-01' || week.days[6] > '9998-12-31') throw Error('Die vollständige Woche liegt außerhalb des unterstützten Zeitraums.')
  return { from: week.monday, to: week.days[6] }
}
export function moveReport(mode: PeriodMode, date: string, offset: number) {
  const next = mode === 'month' ? moveMonth(date, offset) : addDays(date, offset * 7)
  reportRange(mode, next); return next
}
export function analyticsReport(data: AnalyticsData, mode: PeriodMode, date: string, groupId = '') {
  const range = reportRange(mode, date), shiftKnown = !data.unavailable?.shifts
  const classificationKnown = shiftKnown && !!data.setup?.completed && !data.unavailable?.setup
  const entries = data.shifts.filter(shift => shift.date >= range.from && shift.date <= range.to)
  const people = schedulePeople(data.employees, entries, data.absences, range.from, range.to).filter(person => !groupId || person.groupId === groupId)
  const rows = people.map(person => {
    const shifts = entries.filter(shift => shift.employeeId === person.id), profile = data.employees.find(item => item.id === person.id)
    const counts = dutyCounts(person.id, entries, classificationKnown ? data.setup : null, range.from, range.to)
    const coreDates = new Set(shifts.filter(shift => shiftPeriods(shift, data.setup).some(period => period.kind === 'core')).map(shift => shift.date))
    return { ...person, net: shiftKnown && !netTimeProblem(shifts) ? counts.net : null, early: classificationKnown ? counts.early : null, core: classificationKnown ? coreDates.size : null, late: classificationKnown ? counts.late : null, weekend: shiftKnown ? counts.weekend : null,
      contract: profile && Number.isSafeInteger(profile.weeklyMinutes) && profile.weeklyMinutes > 0 ? profile.weeklyMinutes : null,
      availability: profile ? `${profile.availability.start}–${profile.availability.end}` : null,
      absence: data.unavailable?.absences ? null : data.absences.some(absence => absence.employeeId === person.id && absence.startDate <= range.to && absence.endDate >= range.from),
      planned: shiftKnown ? shifts.length > 0 : null, missingBreak: shifts.some(shift => shift.breakMinutes === undefined),
    }
  })
  const sum = (key: 'net' | 'early' | 'core' | 'late' | 'weekend') => rows.reduce((total, row) => total + (row[key] ?? 0), 0)
  const totals = { net: shiftKnown && rows.every(row => row.net !== null) ? sum('net') : null, early: classificationKnown ? sum('early') : null, core: classificationKnown ? sum('core') : null, late: classificationKnown ? sum('late') : null, weekend: shiftKnown ? sum('weekend') : null }
  const warnings: { week: string; text: string }[] = []
  const warningsAvailable = classificationKnown && !data.unavailable?.employees && !data.unavailable?.absences
  if (warningsAvailable) {
    // Reuse P6c only in its complete ISO-week scope, never extrapolate a month's contracts.
    for (let monday = calendarWeek(range.from).monday; monday <= range.to; monday = addDays(monday, 7)) {
      const sunday = calendarWeek(monday).days[6]
      if (monday < range.from || sunday > range.to) continue
      const eligible = data.employees.filter(person => !groupId || person.groupId === groupId)
      const report = fairnessReport({ setup: data.setup, employees: eligible, shifts: data.shifts, absences: data.absences, events: [], snapshot: [] }, { from: monday, to: sunday, shifts: [], demands: [], reasons: [] })
      report.warnings.filter(text => text.startsWith('Frühdienste:') || text.startsWith('Spätdienste:')).forEach(text => warnings.push({ week: monday, text }))
    }
  }
  return { ...range, rows, totals, warnings, warningsAvailable, classificationKnown, empty: shiftKnown && !rows.some(row => row.planned) }
}
export type AnalyticsRow = ReturnType<typeof analyticsReport>['rows'][number]
export function sortReport(rows: AnalyticsRow[], sort: SortKey) {
  return [...rows].sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id)
    if (sort === 'name') return byName
    const first = a[sort], second = b[sort]
    return first === null ? second === null ? byName : 1 : second === null ? -1 : second - first || byName
  })
}
