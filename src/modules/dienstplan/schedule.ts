import type { StorageAccess } from '../kita/setup'
import type { Employee } from '../mitarbeiter/employees'
import { loadEmployees } from '../mitarbeiter/employees'
import { loadSetup } from '../kita/setup'
import { ABSENCE_TYPES } from '../abwesenheiten/absences'
import { listOccurrences } from '../termine/events'
import type { Event } from '../termine/events'
import type { Absence } from '../abwesenheiten/absences'

// P5a storage contract; optional breaks remain optional. No migration or automatic deductions.
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
    (shift.breakMinutes === undefined || Number.isSafeInteger(shift.breakMinutes) && shift.breakMinutes >= 0 && shift.breakMinutes <= minutes(shift.end) - minutes(shift.start)) &&
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

export function validateShift(shift: Shift): string[] {
  const errors: string[] = []
  if (!shift.id.trim() || !shift.employeeId.trim()) errors.push('Bitte einen Mitarbeiter auswählen.')
  if (!shift.groupId.trim()) errors.push('Bitte eine Gruppe auswählen.')
  if (!validDate(shift.date) || shift.date < '0002-01-01' || shift.date > '9998-12-31') errors.push('Bitte ein gültiges Datum zwischen 0002 und 9998 auswählen.')
  const validTimes = [shift.start, shift.end].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) && shift.start < shift.end
  if (!validTimes) errors.push('Beginn muss vor Ende liegen. Nachtschichten über Mitternacht sind noch nicht möglich.')
  if (shift.breakMinutes !== undefined && (!Number.isSafeInteger(shift.breakMinutes) || shift.breakMinutes < 0 || validTimes && shift.breakMinutes > minutes(shift.end) - minutes(shift.start))) errors.push('Die Pause muss eine ganze Minutenzahl ab 0 sein und darf nicht länger als die Schicht sein.')
  return errors
}
export function formatMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
export function workTime(shifts: Shift[]) {
  const gross = shifts.reduce((sum, shift) => sum + minutes(shift.end) - minutes(shift.start), 0)
  const pause = shifts.reduce((sum, shift) => sum + (shift.breakMinutes ?? 0), 0)
  return { gross, pause, net: gross - pause }
}
export function overlappingShifts(value: Shift, shifts: Shift[]): Shift[] {
  return shifts.filter(other => other.id !== value.id && other.employeeId === value.employeeId && other.date === value.date && other.start < value.end && value.start < other.end)
}
export function shiftWarnings(value: Shift, absences: Absence[], events: Event[], employees: Employee[]): string[] {
  if (validateShift(value).length) return []
  const warnings = absences.filter(absence => absence.employeeId === value.employeeId && absence.startDate <= value.date && absence.endDate >= value.date).map(absence => `${ABSENCE_TYPES[absence.type]}${absence.portion === 'full' ? '' : ' (halbtags; Uhrzeit bitte prüfen)'}.`)
  const person = employees.find(person => person.id === value.employeeId)
  const relevant = events.filter(event => event.wholeTeam || event.employeeIds.includes(value.employeeId) || event.groupIds.includes(value.groupId) || !!person && event.groupIds.includes(person.groupId))
  for (const item of listOccurrences(relevant, value.date, value.date)) {
    if (item.start < value.end && value.start < item.end) warnings.push(`Sondertermin „${events.find(event => event.id === item.eventId)!.title}“ (${item.start}–${item.end}).`)
  }
  return warnings
}
function unchanged(a: Shift, b: Shift): boolean {
  return (['id', 'employeeId', 'groupId', 'date', 'start', 'end', 'breakMinutes', 'employeeName'] as const).every(key => a[key] === b[key])
}
export function saveShift(storage: StorageAccess, value: Shift, mode: 'create' | 'update', expected?: Shift): Shift[] {
  const errors = validateShift(value)
  if (errors.length) throw new Error(errors.join(' '))
  if (!shiftShape(value)) throw new Error('Die Schicht hat ein ungültiges Format.')
  const current = loadShifts(storage)
  const old = current.find(shift => shift.id === value.id)
  if (mode === 'create' && old) throw new Error('Diese Schicht-ID ist bereits vergeben.')
  if (mode === 'update' && !old) throw new Error('Die Schicht wurde inzwischen gelöscht. Bitte neu laden.')
  if (old && expected && !unchanged(old, expected)) throw new Error('Die Schicht wurde inzwischen geändert. Bitte abbrechen und neu öffnen.')
  const employee = loadEmployees(storage).employees.find(person => person.id === value.employeeId)
  const groups = loadSetup(storage)?.groups ?? []
  if (!employee && (!old || old.employeeId !== value.employeeId)) throw new Error('Bitte einen vorhandenen Mitarbeiter auswählen.')
  if (!groups.some(group => group.id === value.groupId) && (!old || old.groupId !== value.groupId)) throw new Error('Bitte eine vorhandene Gruppe auswählen.')
  if (overlappingShifts(value, current).length) throw new Error('Zeitüberschneidung: Für diese Person ist an diesem Tag bereits eine Schicht eingetragen. Bitte Beginn und Ende prüfen.')
  const normalized = { ...value, employeeName: employee?.name ?? old?.employeeName }
  const next = mode === 'create' ? [...current, normalized] : current.map(shift => shift.id === value.id ? normalized : shift)
  storage.setItem(SHIFTS_KEY, JSON.stringify({ version: 1, shifts: next }))
  return next
}
export function deleteShift(storage: StorageAccess, expected: Shift): Shift[] {
  const current = loadShifts(storage)
  const old = current.find(shift => shift.id === expected.id)
  if (!old) throw new Error('Die Schicht wurde bereits gelöscht. Bitte neu laden.')
  if (!unchanged(old, expected)) throw new Error('Die Schicht wurde inzwischen geändert. Bitte abbrechen und neu öffnen.')
  const next = current.filter(shift => shift.id !== expected.id)
  storage.setItem(SHIFTS_KEY, JSON.stringify({ version: 1, shifts: next }))
  return next
}
