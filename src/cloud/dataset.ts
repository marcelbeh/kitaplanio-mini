import { loadSetup, STORAGE_KEY } from '../modules/kita/setup'
import { loadInterview, INTERVIEW_KEY } from '../modules/kita/interview'
import { loadEmployees, EMPLOYEES_KEY } from '../modules/mitarbeiter/employees'
import { loadShifts, SHIFTS_KEY } from '../modules/dienstplan/schedule'
import { loadAbsences, ABSENCES_KEY } from '../modules/abwesenheiten/absences'
import { loadEvents, EVENTS_KEY } from '../modules/termine/events'
import { loadPublications, PUBLICATIONS_KEY } from '../modules/dienstplan/publications'

export const AREAS = [STORAGE_KEY, INTERVIEW_KEY, EMPLOYEES_KEY, SHIFTS_KEY, ABSENCES_KEY, EVENTS_KEY, PUBLICATIONS_KEY] as const
export type Payload = Record<string, unknown>
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
}
export const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b)
export function payloadStorage(payload: Payload) {
  return { getItem: (key: string) => payload[key] == null ? null : JSON.stringify(payload[key]), setItem() {} }
}
export function validatePayload(value: unknown): Payload {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== AREAS.length || !AREAS.every(key => Object.hasOwn(value, key))) throw Error('Cloud-Datenbestand unvollständig oder unbekannt. Keine Daten wurden übernommen.')
  const payload = value as Payload
  if (!AREAS.every(key => payload[key] === null || (!!payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])))) throw Error('Ungültige Cloud-Datenbereiche.')
  const storage = payloadStorage(payload)
  loadSetup(storage); loadInterview(storage); loadEmployees(storage); loadShifts(storage); loadAbsences(storage); loadEvents(storage); loadPublications(storage)
  return payload
}
export function preservePublications(before: Payload, after: Payload) {
  const old = loadPublications(payloadStorage(before)).plans, next = loadPublications(payloadStorage(after)).plans
  if (old.some(plan => !next.some(item => item.from === plan.from && item.version === plan.version && equal(item, plan)))) throw Error('Veröffentlichte Wochenversionen würden fehlen oder verändert. Bitte die Bestände vor einer Übernahme manuell zusammenführen (P8c).')
}
export function overview(payload: Payload): string {
  const storage = payloadStorage(payload)
  return `${loadSetup(storage)?.name || 'Kita ohne Namen'} · ${loadEmployees(storage).employees.length} Mitarbeitende · ${loadShifts(storage).length} Schichten · ${loadAbsences(storage).absences.length} Abwesenheiten · ${loadEvents(storage).length} Termine · ${loadPublications(storage).plans.length} Freigaben`
}
