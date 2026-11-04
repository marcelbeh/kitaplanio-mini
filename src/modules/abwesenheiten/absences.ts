import type { StorageAccess } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'

export const ABSENCES_KEY = 'kitaplanio-lite:absences:v1'
export const ABSENCE_TYPES = {
  vacation: 'Urlaub', sickness: 'Krankheit', training: 'Fortbildung', timeOff: 'Freizeitausgleich', other: 'Sonstige Abwesenheit',
} as const
export const PORTIONS = { full: 'Ganztägig', am: 'Halbtags · Vormittag', pm: 'Halbtags · Nachmittag' } as const
export type Absence = {
  id: string
  employeeId: string
  // Fallback for historical entries after a team member is removed.
  employeeName: string
  type: keyof typeof ABSENCE_TYPES
  startDate: string
  endDate: string
  portion: keyof typeof PORTIONS
}
export type AbsenceStore = { version: 1; absences: Absence[] }
export function newAbsence(id: string): Absence {
  return { id, employeeId: '', employeeName: '', type: 'vacation', startDate: '', endDate: '', portion: 'full' }
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validateAbsence(value: Absence): string[] {
  const errors: string[] = []
  if (!value.id.trim()) errors.push('Die Abwesenheits-ID fehlt.')
  if (!value.employeeId.trim()) errors.push('Bitte einen Mitarbeiter auswählen.')
  if (!Object.hasOwn(ABSENCE_TYPES, value.type)) errors.push('Bitte eine gültige Abwesenheitsart auswählen.')
  if (!validDate(value.startDate) || !validDate(value.endDate)) errors.push('Bitte ein gültiges Start- und Enddatum eingeben.')
  else if (value.endDate < value.startDate) errors.push('Das Enddatum darf nicht vor dem Startdatum liegen.')
  if (!Object.hasOwn(PORTIONS, value.portion)) errors.push('Bitte ganztägig, Vormittag oder Nachmittag auswählen.')
  if (value.portion !== 'full' && value.startDate !== value.endDate) errors.push('Halbtägige Abwesenheiten bitte für einen einzelnen Tag erfassen (Start- und Enddatum gleich).')
  return errors
}
// Calendar half-day slots, inclusive. No timezone, workday or contracted-hour calculation.
function slots(value: Absence): [number, number] {
  return [Date.parse(`${value.startDate}T00:00:00Z`) / 86400000 * 2 + (value.portion === 'pm' ? 1 : 0),
    Date.parse(`${value.endDate}T00:00:00Z`) / 86400000 * 2 + (value.portion === 'am' ? 0 : 1)]
}
export function findOverlaps(value: Absence, entries: Absence[]): Absence[] {
  if (validateAbsence(value).length) return []
  const [start, end] = slots(value)
  return entries.filter(item => {
    if (item.id === value.id || item.employeeId !== value.employeeId) return false
    const [otherStart, otherEnd] = slots(item)
    return start <= otherEnd && otherStart <= end
  })
}
export function sortAbsences(entries: Absence[]): Absence[] {
  return [...entries].sort((a, b) => slots(a)[0] - slots(b)[0] || a.endDate.localeCompare(b.endDate) || a.employeeName.localeCompare(b.employeeName, 'de') || a.id.localeCompare(b.id))
}
export function filterAbsences(entries: Absence[], filters: { employeeId: string; from: string; to: string }): Absence[] {
  return sortAbsences(entries.filter(item => (!filters.employeeId || item.employeeId === filters.employeeId) && (!filters.from || item.endDate >= filters.from) && (!filters.to || item.startDate <= filters.to)))
}
export function formatAbsence(value: Absence): string {
  const date = (text: string) => text.split('-').reverse().join('.')
  return `${date(value.startDate)}${value.startDate !== value.endDate ? `–${date(value.endDate)}` : ''} · ${PORTIONS[value.portion]}`
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function absenceShape(value: unknown): value is Absence {
  return record(value) && ['id','employeeId','employeeName','type','startDate','endDate','portion'].every(key => typeof value[key] === 'string')
}
export function loadAbsences(storage: StorageAccess): AbsenceStore {
  const raw = storage.getItem(ABSENCES_KEY)
  if (raw === null) return { version: 1, absences: [] }
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.absences) || !value.absences.every(absenceShape) || value.absences.some(item => validateAbsence(item).length || !item.employeeName.trim()) || new Set(value.absences.map(item => item.id)).size !== value.absences.length) throw new Error('Die gespeicherten Abwesenheiten sind ungültig oder haben eine unbekannte Version. Vorhandene Daten wurden nicht überschrieben.')
  return value as AbsenceStore
}
export function saveAbsence(storage: StorageAccess, value: Absence, mode: 'create' | 'update', expected?: Absence): AbsenceStore {
  if (!absenceShape(value)) throw new Error('Die Abwesenheit hat ein ungültiges Datenformat.')
  const errors = validateAbsence(value)
  if (errors.length) throw new Error(errors.join(' '))
  const current = loadAbsences(storage)
  const old = current.absences.find(item => item.id === value.id)
  if (mode === 'create' && old) throw new Error('Diese Abwesenheits-ID ist bereits vergeben.')
  if (mode === 'update' && !old) throw new Error('Der Eintrag wurde inzwischen entfernt. Bitte die Übersicht neu laden.')
  if (expected && JSON.stringify(old) !== JSON.stringify(expected)) throw Error('Die Abwesenheit wurde inzwischen geändert. Bitte neu laden; es wurde nichts überschrieben.')
  const employee = loadEmployees(storage).employees.find(item => item.id === value.employeeId)
  // Existing historical references remain editable, but new entries need a current team member.
  if (!employee && (!old || old.employeeId !== value.employeeId)) throw new Error('Bitte einen vorhandenen Mitarbeiter auswählen.')
  const conflicts = findOverlaps(value, current.absences)
  if (conflicts.length) throw new Error(`Überschneidung: Für diese Person ist bereits ${conflicts.map(item => `${ABSENCE_TYPES[item.type]} (${formatAbsence(item)})`).join(', ')} eingetragen. Bitte den Zeitraum oder den halben Tag prüfen.`)
  const normalized = { ...value, employeeName: employee?.name ?? old!.employeeName }
  const next: AbsenceStore = { version: 1, absences: sortAbsences(mode === 'create' ? [...current.absences, normalized] : current.absences.map(item => item.id === value.id ? normalized : item)) }
  storage.setItem(ABSENCES_KEY, JSON.stringify(next))
  return next
}
export function deleteAbsence(storage: StorageAccess, id: string, expected?: Absence): AbsenceStore {
  const current = loadAbsences(storage)
  if (!current.absences.some(item => item.id === id)) throw new Error('Der Eintrag wurde bereits entfernt. Bitte die Übersicht neu laden.')
  if (expected && JSON.stringify(current.absences.find(item => item.id === id)) !== JSON.stringify(expected)) throw Error('Die Abwesenheit wurde inzwischen geändert. Bitte Löschung erneut prüfen.')
  const next: AbsenceStore = { version: 1, absences: current.absences.filter(item => item.id !== id) }
  storage.setItem(ABSENCES_KEY, JSON.stringify(next))
  return next
}
