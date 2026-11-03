import type { StorageAccess } from '../kita/setup'
import type { Employee } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'

// First shift storage contract, shared with the forthcoming editor. This view never writes it.
export const SHIFTS_KEY = 'kitaplanio-lite:shifts:v1'
export type Shift = {
  id: string; employeeId: string; groupId: string; date: string; start: string; end: string
  breakMinutes?: number
  employeeName?: string
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear().toString().padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
export function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}
// Arithmetic uses UTC calendar dates, display uses local today. No DST-dependent 24-hour offsets.
export function calendarWeek(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  const monday = addDays(value, -((date.getUTCDay() + 6) % 7))
  const thursday = new Date(`${addDays(monday, 3)}T00:00:00Z`)
  const year = thursday.getUTCFullYear()
  const january4 = new Date(0)
  january4.setUTCFullYear(year, 0, 4)
  const firstMonday = addDays(january4.toISOString().slice(0, 10), -((january4.getUTCDay() + 6) % 7))
  const week = 1 + Math.round((Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${firstMonday}T00:00:00Z`)) / 604800000)
  return { monday, week, year, days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)) }
}
export const dateLabel = (date: string, weekday = false) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...(weekday ? { weekday: 'long' } : {}), day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T00:00:00Z`))
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function minutes(time: string) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) }
function shiftShape(value: unknown): value is Shift {
  if (!record(value) || !['id','employeeId','groupId','date','start','end'].every(key => typeof value[key] === 'string' && value[key].trim())) return false
  const shift = value as unknown as Shift
  return validDate(shift.date) && [shift.start, shift.end].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) && shift.start < shift.end &&
    (shift.breakMinutes === undefined || Number.isSafeInteger(shift.breakMinutes) && shift.breakMinutes >= 0 && shift.breakMinutes < minutes(shift.end) - minutes(shift.start)) &&
    (shift.employeeName === undefined || typeof shift.employeeName === 'string')
}
export function loadShifts(storage: StorageAccess): Shift[] {
  const raw = storage.getItem(SHIFTS_KEY)
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.shifts) || !value.shifts.every(shiftShape) || new Set(value.shifts.map(shift => shift.id)).size !== value.shifts.length) throw new Error('Die gespeicherten Schichten haben ein ungültiges Format oder eine unbekannte Version.')
  return [...value.shifts].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
}
export function dayEntries(employeeId: string, date: string, shifts: Shift[], absences: Absence[]) {
  return { shifts: shifts.filter(shift => shift.employeeId === employeeId && shift.date === date), absences: absences.filter(absence => absence.employeeId === employeeId && absence.startDate <= date && absence.endDate >= date) }
}
export type SchedulePerson = Pick<Employee, 'id' | 'name' | 'groupId'> & { historical?: boolean }
export function schedulePeople(employees: Employee[], shifts: Shift[], absences: Absence[], from: string, to: string): SchedulePerson[] {
  const people: SchedulePerson[] = [...employees]
  const ids = new Set(people.map(person => person.id))
  for (const item of [...shifts.filter(shift => shift.date >= from && shift.date <= to), ...absences.filter(absence => absence.endDate >= from && absence.startDate <= to)]) {
    if (ids.has(item.employeeId)) continue
    people.push({ id: item.employeeId, name: item.employeeName || `Teammitglied ${item.employeeId}`, groupId: 'groupId' in item ? item.groupId : '', historical: true })
    ids.add(item.employeeId)
  }
  return people.sort((a, b) => a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id))
}
