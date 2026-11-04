import type { KitaSetup } from '../kita/setup'
import type { Employee } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'
import { listOccurrences } from '../termine/events'
import type { Event, Occurrence } from '../termine/events'
import { addDays, calendarWeek, schedulePeople, validDate, workTime } from './schedule'
import type { Shift } from './schedule'
import { checkPlan } from './checks'
import type { CheckOptions, ShiftInspection } from './checks'
import { calculateStaffing } from './staffing'

export type MonthData = { setup: KitaSetup | null; employees: Employee[]; shifts: Shift[]; absences: Absence[]; events: Event[]; inspection: ShiftInspection; errors: string[]; options?: CheckOptions }
export function monthBounds(date: string) {
  if (!validDate(date) || date < '0002-01-01' || date > '9998-12-31') throw Error('Bitte einen gültigen Monat zwischen 0002 und 9998 auswählen.')
  const from = `${date.slice(0, 7)}-01`, last = new Date(`${from}T00:00:00Z`)
  last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0)
  return { from, to: last.toISOString().slice(0, 10) }
}
export function moveMonth(date: string, offset: number): string {
  const value = new Date(`${monthBounds(date).from}T00:00:00Z`)
  value.setUTCMonth(value.getUTCMonth() + offset)
  if (!Number.isInteger(offset) || value.getUTCFullYear() < 2 || value.getUTCFullYear() > 9998 || !Number.isFinite(value.getTime())) throw Error('Monatsgrenze erreicht (0002–9998).')
  return value.toISOString().slice(0, 10)
}
export function monthOverview(date: string, data: MonthData, filter = '') {
  const { from, to } = monthBounds(date)
  const people = schedulePeople(data.employees, data.shifts, data.absences, from, to).filter(person => !filter || person.groupId === filter)
  const ids = new Set(people.map(person => person.id))
  const shifts = data.shifts.filter(shift => shift.date >= from && shift.date <= to && ids.has(shift.employeeId))
  const absences = data.absences.filter(absence => ids.has(absence.employeeId) && absence.startDate <= to && absence.endDate >= from)
  const events = data.events.filter(event => !filter || event.wholeTeam || event.groupIds.includes(filter) || event.employeeIds.some(id => ids.has(id)))
  const occurrences = listOccurrences(events, from, to)
  const dates: string[] = []
  for (let current = from; current <= to; current = addDays(current, 1)) dates.push(current)
  // Preserve the existing weekly rules' scope; never compare a whole month to one week's contract.
  const weekStarts = [...new Set(dates.map(day => calendarWeek(day).monday))]
  const issues = weekStarts.flatMap(monday => checkPlan({ from: monday, to: calendarWeek(monday).days[6], setup: data.setup, employees: data.employees, absences: data.absences, inspection: data.inspection, errors: data.errors, options: data.options ?? data.setup?.planningRules }))
  const days = dates.flatMap(day => {
    const planned = new Set(shifts.filter(shift => shift.date === day).map(shift => shift.employeeId)).size
    const entries = occurrences.filter(event => event.date === day)
    const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay())
    if (weekend && !planned && !entries.length) return []
    const dayIssues = issues.filter(issue => issue.date === day)
    return [{ date: day, weekend, planned, absent: new Set(absences.filter(absence => absence.startDate <= day && absence.endDate >= day).map(absence => absence.employeeId)).size,
      events: entries.map((item: Occurrence) => ({ ...item, title: events.find(event => event.id === item.eventId)!.title })),
      staffing: calculateStaffing(day, data.setup, data.shifts, data.absences, data.employees, data.errors.some(error => /^(Mitarbeiterdaten|Schichten|Abwesenheiten)/.test(error))),
      conflicts: dayIssues.filter(issue => issue.kind === 'conflict').length, hints: dayIssues.filter(issue => issue.kind === 'hint').length,
    }]
  })
  return { from, to, days, weeks: [...new Set(days.map(day => calendarWeek(day.date).monday))], hours: people.map(person => ({ ...person, net: workTime(shifts.filter(shift => shift.employeeId === person.id)).net })) }
}
