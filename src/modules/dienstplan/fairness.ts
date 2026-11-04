import type { Employee } from '../mitarbeiter/employees'
import type { KitaSetup, PlanningLimits } from '../kita/setup'
import type { Shift } from './schedule'
import type { GeneratorContext, Proposal } from './generator'
import { calendarWeek, workTime } from './schedule'

export type DutyKind = 'early' | 'late' | 'weekend' | 'core'
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const dayName = (date: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]
export function wishMisses(person: Employee, date: string, start: string, end: string): string[] {
  const result: string[] = []
  if (person.preferences?.preferredDaysOff?.some(day => day === dayName(date))) result.push('Bevorzugter freier Tag nicht erfüllt')
  const hours = person.preferences?.preferredHours
  if (hours && (start < hours.start || end > hours.end)) result.push(`Wunschzeitfenster ${hours.start}–${hours.end} nicht vollständig erfüllt`)
  return result
}
export function dutyCounts(personId: string, shifts: Shift[], setup: KitaSetup | null, from: string, to: string) {
  const entries = shifts.filter(shift => shift.employeeId === personId && shift.date >= from && shift.date <= to)
  const early = new Set<string>(), late = new Set<string>(), weekend = new Set<string>()
  for (const shift of entries) {
    if (['sat','sun'].includes(dayName(shift.date))) weekend.add(shift.date)
    else if (setup && (setup.careDays ?? ['mon','tue','wed','thu','fri']).some(day => day === dayName(shift.date))) {
      if (shift.start < setup.early.end && setup.early.start < shift.end) early.add(shift.date)
      if (shift.start < setup.late.end && setup.late.start < shift.end) late.add(shift.date)
    }
  }
  return { net: workTime(entries).net, early: early.size, late: late.size, weekend: weekend.size }
}
// Limits are optional, and never inferred. Adjacent parts form one continuous duty, avoiding artificial splits.
export function respectsLimits(personId: string, date: string, start: number, end: number, shifts: Shift[], limits: PlanningLimits = {}): boolean {
  const stamp = (day: string, time: number) => Date.parse(`${day}T00:00:00Z`) / 60000 + time
  let first = stamp(date, start), last = stamp(date, end)
  const entries = shifts.filter(shift => shift.employeeId === personId).map(shift => ({ start: stamp(shift.date, minute(shift.start)), end: stamp(shift.date, minute(shift.end)) }))
  const joined = new Set<number>()
  let changed = true
  while (changed) {
    changed = false
    entries.forEach((shift, index) => {
      if (!joined.has(index) && shift.start <= last && shift.end >= first) { joined.add(index); first = Math.min(first, shift.start); last = Math.max(last, shift.end); changed = true }
    })
  }
  if (limits.maxShiftMinutes !== undefined && last - first > limits.maxShiftMinutes) return false
  if (limits.minRestMinutes !== undefined && entries.some((shift, index) => !joined.has(index) && Math.max(shift.start - last, first - shift.end) < limits.minRestMinutes!)) return false
  return true
}
export function candidateRank(person: Employee, kind: DutyKind, date: string, start: number, end: number, shifts: Shift[], setup: KitaSetup, from: string, to: string): number[] {
  const hours = person.preferences?.preferredHours
  const free = person.preferences?.preferredDaysOff?.some(day => day === dayName(date)) ? 1 : 0
  const outside = hours ? Math.max(0, Math.min(end, minute(hours.start)) - start) + Math.max(0, end - Math.max(start, minute(hours.end))) : 0
  const categoryStart = kind === 'early' ? minute(setup.early.start) : kind === 'late' ? minute(setup.late.start) : kind === 'core' ? minute(setup.early.end) : 0
  const continuing = shifts.some(shift => shift.employeeId === person.id && shift.date === date && minute(shift.end) === start && minute(shift.end) > categoryStart) ? 0 : 1
  const counts = dutyCounts(person.id, shifts, setup, from, to)
  const today = dutyCounts(person.id, shifts, setup, date, date)
  const burden = kind === 'core' ? 0 : (counts[kind] + (today[kind] ? 0 : 1)) / person.weeklyMinutes
  return [free, outside, continuing, burden, counts.net / person.weeklyMinutes]
}
export function compareRanks(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-12) return a[i] - b[i]
  return 0
}
export function fairnessReport(context: GeneratorContext, proposal: Proposal) {
  const shifts = [...context.shifts, ...proposal.shifts]
  const rows = context.employees.map(person => ({ ...dutyCounts(person.id, shifts, context.setup, proposal.from, proposal.to), id: person.id, name: person.name, contract: person.weeklyMinutes }))
  const warnings = new Set<string>()
  for (const shift of shifts.filter(shift => shift.date >= proposal.from && shift.date <= proposal.to)) {
    const person = context.employees.find(person => person.id === shift.employeeId)
    if (person) wishMisses(person, shift.date, shift.start, shift.end).forEach(reason => warnings.add(`${shift.date} · ${person.name}: ${reason}. Bedarf, harte Regeln oder bestehende Dienste haben Vorrang; bitte manuell prüfen.`))
  }
  for (const kind of ['early','late','weekend'] as const) {
    const eligibleDates = (person: Employee) => calendarWeek(proposal.from).days.filter(date => {
      const day = dayName(date)
      const periods = kind === 'weekend' ? proposal.demands.filter(demand => demand.date === date && demand.groupId === person.groupId) : context.setup ? [context.setup[kind]] : []
      return (kind === 'weekend' ? ['sat','sun'].includes(day) : (context.setup?.careDays ?? ['mon','tue','wed','thu','fri']).some(value => value === day) && person.workdays.some(value => value === day)) && periods.some(period => person.availability.start <= period.start && person.availability.end >= period.end) && !person.fixedTimes[day as keyof typeof person.fixedTimes] && !context.absences.some(absence => absence.employeeId === person.id && absence.startDate <= date && absence.endDate >= date) && !person.rules.some(rule => rule.type === 'must' && (rule.weekday === null || rule.weekday === day))
    }).join(',')
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j], first = context.employees[i], second = context.employees[j]
      const dates = eligibleDates(first)
      if (a.contract > 0 && b.contract > 0 && first.groupId === second.groupId && dates && dates === eligibleDates(second) && Math.abs(a[kind] / a.contract - b[kind] / b.contract) > 1 / Math.min(a.contract, b.contract) + 1e-12) warnings.add(`${kind === 'early' ? 'Früh' : kind === 'late' ? 'Spät' : 'Wochenend'}dienste: ${a.name} ${a[kind]}, ${b.name} ${b[kind]} – auf Vertragsstunden normiert mehr als ein Dienst Unterschied. Wünsche und feste Vorgaben können die Verteilung erklären.`)
    }
  }
  return { rows, warnings: [...warnings] }
}
