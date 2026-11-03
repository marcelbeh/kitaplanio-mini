import type { StorageAccess } from '../kita/setup'
import type { Employee } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'

export const EVENTS_KEY = 'kitaplanio-lite:events:v1'
export const EVENT_TYPES = { meeting: 'Teamsitzung', training: 'Fortbildung', trip: 'Ausflug', celebration: 'Veranstaltung', other: 'Sonstiges' } as const
export type Event = {
  id: string; title: string; date: string; start: string; end: string; note: string
  type: keyof typeof EVENT_TYPES
  wholeTeam: boolean; employeeIds: string[]; groupIds: string[]
  recurrence: 'once' | 'weekly' | 'monthly'; until: string
}
// Stable series ID + occurrence date form a planning reference. Local dates/times have no UTC conversion.
export type Occurrence = { eventId: string; date: string; start: string; end: string }
export function newEvent(id: string): Event {
  return { id, title: '', date: '', start: '', end: '', note: '', type: 'meeting', wholeTeam: false, employeeIds: [], groupIds: [], recurrence: 'once', until: '' }
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '0001-01-01' && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
export function validateEvent(value: Event): string[] {
  const errors: string[] = []
  if (!value.id.trim() || !value.title.trim()) errors.push('Bitte einen Titel eingeben.')
  if (!Object.hasOwn(EVENT_TYPES, value.type)) errors.push('Bitte eine gültige Terminart auswählen.')
  if (!validDate(value.date)) errors.push('Bitte ein gültiges Datum eingeben.')
  if (![value.start, value.end].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || value.end <= value.start) errors.push('Bitte Beginn und Ende am selben Tag eingeben; Ende nach Beginn.')
  if (!value.wholeTeam && !value.employeeIds.length && !value.groupIds.length) errors.push('Bitte Mitarbeitende, Gruppen oder das gesamte Team auswählen.')
  if (![...value.employeeIds, ...value.groupIds].every(id => id.trim()) || new Set(value.employeeIds).size !== value.employeeIds.length || new Set(value.groupIds).size !== value.groupIds.length) errors.push('Die Auswahl enthält ungültige oder doppelte IDs.')
  if (!['once', 'weekly', 'monthly'].includes(value.recurrence)) errors.push('Bitte eine gültige Wiederholung auswählen.')
  if (value.recurrence !== 'once' && (!validDate(value.until) || value.until < value.date)) errors.push('Bitte ein Enddatum ab dem ersten Termin festlegen.')
  return errors
}
export function occurrences(value: Event, from = '', to = '9999-12-31'): Occurrence[] {
  if (validateEvent(value).length) return []
  const last = value.recurrence === 'once' ? value.date : value.until
  const end = last < to ? last : to
  const result: Occurrence[] = []
  const base = new Date(`${value.date}T00:00:00Z`)
  for (let i = 0; ; i++) {
    const day = new Date(base)
    if (value.recurrence === 'weekly') day.setUTCDate(base.getUTCDate() + i * 7)
    if (value.recurrence === 'monthly') {
      day.setUTCDate(1)
      day.setUTCMonth(base.getUTCMonth() + i)
      // Same calendar day; months without that day are skipped (e.g. February 31).
      const month = day.getUTCMonth()
      day.setUTCDate(base.getUTCDate())
      if (day.getUTCFullYear() > 9999) break
      if (day.getUTCMonth() !== month) { if (day.toISOString().slice(0, 10) > end) break; continue }
    }
    if (day.getUTCFullYear() > 9999) break
    const date = day.toISOString().slice(0, 10)
    if (date > end) break
    if (date >= from) result.push({ eventId: value.id, date, start: value.start, end: value.end })
    if (value.recurrence === 'once') break
  }
  return result
}
export function listOccurrences(events: Event[], from: string, to: string): Occurrence[] {
  if (from && to && from > to) return []
  return events.flatMap(event => occurrences(event, from, to || '9999-12-31')).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.eventId.localeCompare(b.eventId))
}
export function affectedEmployeeIds(value: Event, employees: Employee[]): string[] {
  return [...new Set([...value.employeeIds, ...employees.filter(person => value.wholeTeam || value.groupIds.includes(person.groupId)).map(person => person.id)])]
}
export function conflictHints(value: Event, events: Event[], absences: Absence[], employees: Employee[]): string[] {
  const own = occurrences(value)
  if (!own.length) return []
  const people = affectedEmployeeIds(value, employees)
  const hints: string[] = []
  for (const other of events) {
    if (other.id === value.id) continue
    const shared = value.wholeTeam || other.wholeTeam || other.groupIds.some(id => value.groupIds.includes(id)) || affectedEmployeeIds(other, employees).some(id => people.includes(id))
    if (!shared) continue
    const dates = new Set(occurrences(other, value.date, own[own.length - 1].date).filter(item => item.start < value.end && value.start < item.end).map(item => item.date))
    const first = own.find(item => dates.has(item.date))
    if (first) hints.push(`${first.date}: Überschneidung mit „${other.title}“.`)
  }
  for (const absence of absences) {
    if (!value.wholeTeam && !people.includes(absence.employeeId)) continue
    const first = own.find(item => item.date >= absence.startDate && item.date <= absence.endDate)
    // Half-day absences have no fixed clock boundaries in the existing model.
    if (first) hints.push(`${first.date}: Abwesenheit von ${absence.employeeName}${absence.portion === 'full' ? '' : ' (halbtags; Uhrzeit bitte prüfen)'}.`)
  }
  return hints
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function eventShape(value: unknown): value is Event {
  return record(value) && ['id','title','date','start','end','note','type','recurrence','until'].every(key => typeof value[key] === 'string') && typeof value.wholeTeam === 'boolean' && ['employeeIds','groupIds'].every(key => Array.isArray(value[key]) && value[key].every((id: unknown) => typeof id === 'string'))
}
export function loadEvents(storage: StorageAccess): Event[] {
  const raw = storage.getItem(EVENTS_KEY)
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.events) || !value.events.every(eventShape) || value.events.some(item => validateEvent(item).length) || new Set(value.events.map(item => item.id)).size !== value.events.length) throw new Error('Termindaten sind ungültig oder haben eine unbekannte Version. Vorhandene Daten bleiben erhalten.')
  return value.events
}
export function saveEvent(storage: StorageAccess, value: Event, mode: 'create' | 'update'): Event[] {
  if (!eventShape(value)) throw new Error('Ungültiges Terminformat.')
  const errors = validateEvent(value)
  if (errors.length) throw new Error(errors.join(' '))
  const current = loadEvents(storage), exists = current.some(item => item.id === value.id)
  if (mode === 'create' && exists) throw new Error('Diese Termin-ID ist bereits vergeben.')
  if (mode === 'update' && !exists) throw new Error('Der Termin wurde inzwischen entfernt. Bitte neu laden.')
  const normalized = { ...value, title: value.title.trim(), until: value.recurrence === 'once' ? '' : value.until }
  const next = mode === 'create' ? [...current, normalized] : current.map(item => item.id === value.id ? normalized : item)
  storage.setItem(EVENTS_KEY, JSON.stringify({ version: 1, events: next }))
  return next
}
export function deleteEvent(storage: StorageAccess, id: string): Event[] {
  const current = loadEvents(storage)
  if (!current.some(item => item.id === id)) throw new Error('Der Termin wurde bereits entfernt. Bitte neu laden.')
  const next = current.filter(item => item.id !== id)
  storage.setItem(EVENTS_KEY, JSON.stringify({ version: 1, events: next }))
  return next
}
