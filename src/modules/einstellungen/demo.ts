import { AREAS, equal, validatePayload } from '../../cloud/dataset'
import type { Payload } from '../../cloud/dataset'
import { ACTIVE_KEY } from '../../cloud/workspace'
import { INTERVIEW_KEY, startInterview } from '../kita/interview'
import type { KitaSetup } from '../kita/setup'
import { validateEmployee } from '../mitarbeiter/employees'
import type { Employee, Weekday } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'
import { newEvent } from '../termine/events'
import { calendarWeek, localDate } from '../dienstplan/schedule'
import type { Shift } from '../dienstplan/schedule'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>
export const DEMO_NAME = 'DEMO · Kita Sonnengarten'
const workdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']
export function buildDemo(date = localDate()): { payload: Payload; monday: string; sunday: string } {
  const week = calendarWeek(date)
  const setup: KitaSetup = { version: 1, completed: true, name: DEMO_NAME, careDays: workdays,
    opening: { start: '07:00', end: '16:00' }, early: { start: '07:00', end: '08:00', minimum: 3 }, late: { start: '15:00', end: '16:00', minimum: 3 },
    pauseNotes: 'DEMO: Sollwerte sind frei gewählte Testvorgaben, keine gesetzlichen Vorgaben. Pausen sind nur als Dauer erfasst; Lage und halbtägige Abwesenheit bleiben ungeklärt. Abwesenheiten zeigen beispielhaft Bedarfslücken und Stundenabweichungen.',
    groups: ['Nest', 'Sonne', 'Sterne'].map((name, i) => ({ id: `demo-group-${i}`, name, periods: [{ start: '08:00', end: '09:00', minimum: 1 }, { start: '09:00', end: '14:00', minimum: 2 }, { start: '14:00', end: '15:00', minimum: 1 }] })),
  }
  const team: [string, number, number][] = [['Nora Nest', 0, 37.5], ['Nils Nest', 0, 35], ['Nele Nest', 0, 25], ['Sofia Sonne', 1, 37.5], ['Sami Sonne', 1, 32.5], ['Sina Sonne', 1, 30], ['Simon Sonne', 1, 20], ['Stella Sterne', 2, 37.5], ['Sven Sterne', 2, 35], ['Selma Sterne', 2, 30], ['Silas Sterne', 2, 24]]
  const employees: Employee[] = team.map(([name, group, hours], index) => ({ id: `demo-person-${index}`, name: `DEMO · ${name}`, groupId: setup.groups[group].id, qualification: 'Fiktive pädagogische Fachkraft · DEMO', weeklyMinutes: hours * 60, workdays, availability: { start: '07:00', end: '16:00' }, fixedTimes: {}, rules: [] }))
  const absence = (id: string, index: number, day: number, type: Absence['type'], portion: Absence['portion']): Absence => ({ id, employeeId: employees[index].id, employeeName: employees[index].name, startDate: week.days[day], endDate: week.days[day], type, portion })
  const absences = [absence('demo-vacation', 1, 1, 'vacation', 'full'), absence('demo-halfday', 5, 2, 'other', 'am'), absence('demo-training', 6, 3, 'training', 'full')]
  const shifts: Shift[] = []
  for (let day = 0; day < 5; day++) {
    employees.forEach((person, index) => {
      if (absences.some(entry => entry.employeeId === person.id && entry.startDate === week.days[day] && entry.portion === 'full')) return
      const early = day % 2 === 0
      let start = '09:00', end = '14:15', breakMinutes = 15
      if ([0, 3, 7].includes(index)) { const isEarly = index === 7 ? !early : early; start = isEarly ? '07:00' : '08:00'; end = isEarly ? '15:00' : '16:00'; breakMinutes = 30 }
      else if ([1, 8].includes(index)) { const isEarly = index === 8 ? early : !early; start = isEarly ? '07:00' : '08:30'; end = isEarly ? '14:30' : '16:00'; breakMinutes = 30 }
      else if (index === 4) { start = early ? '09:00' : '07:00'; end = early ? '16:00' : '14:00'; breakMinutes = 30 }
      else if ([5, 9].includes(index)) { start = '08:00'; end = '14:30'; breakMinutes = 30 }
      else if (index === 6 || index === 10 && day === 4) { end = '13:00'; breakMinutes = 0 }
      shifts.push({ id: `demo-shift-${index}-${day}`, employeeId: person.id, employeeName: person.name, groupId: person.groupId, date: week.days[day], start, end, breakMinutes })
    })
  }
  const events = [
    { ...newEvent('demo-meeting'), title: 'DEMO · Teamsitzung', date: week.days[2], start: '14:30', end: '15:30', wholeTeam: true, note: 'Fiktiver Termin. Teilzeit, Abwesenheiten und Dienstüberschneidungen bewusst prüfen.' },
    { ...newEvent('demo-trip'), type: 'trip' as const, title: 'DEMO · Nest-Ausflug', date: week.days[3], start: '09:00', end: '12:00', groupIds: [setup.groups[0].id], note: 'Fiktiver Gruppentermin; kein automatischer Schichtwechsel.' },
    { ...newEvent('demo-church'), type: 'celebration' as const, title: 'DEMO · Familiengottesdienst', date: week.days[6], start: '10:00', end: '12:00', employeeIds: [employees[0].id, employees[3].id, employees[7].id], note: 'Kirchlicher Sondertermin. Keine reguläre Wochenendbetreuung, keine automatisch eingetragenen Schichten und kein festgelegter Wochenend-Personalbedarf.' },
  ]
  const payload = validatePayload(Object.fromEntries(AREAS.map((key, index) => [key, [setup, { version: 1, status: 'completed' }, { version: 1, employees }, { version: 1, shifts }, { version: 1, absences }, { version: 1, events }, { version: 1, plans: [] }][index]])))
  if (employees.some(person => validateEmployee(person, setup.groups).length)) throw Error('Demo-Team ist ungültig.')
  return { payload, monday: week.monday, sunday: week.days[6] }
}
function localOnly(storage: Pick<Storage, 'getItem'>) {
  if (storage.getItem(ACTIVE_KEY) !== null) throw Error('Demo gesperrt: zuerst im Cloud-Menü zum bisherigen lokalen Bestand wechseln. Cloud-Bestände bleiben unverändert.')
}
export function demoAvailability(storage: Pick<Storage, 'getItem'>): Record<string, string | null> {
  localOnly(storage)
  const before = Object.fromEntries(AREAS.map(key => [key, storage.getItem(key)]))
  const pristine = startInterview({ getItem: () => null, setItem() {} })
  for (const key of AREAS) {
    if (before[key] === null) continue
    if (key === INTERVIEW_KEY) {
      try { const value = JSON.parse(before[key]!); if (typeof value.paused === 'boolean' && equal({ ...value, paused: false }, pristine)) continue } catch { /* Corrupt or answered drafts are never empty. */ }
    }
    throw Error('Demo kann nur in einen leeren, noch nicht eingerichteten lokalen Bestand geladen werden. Vorhandene Daten werden nicht überschrieben. Bei Bedarf zuerst mit Sicherung zurücksetzen.')
  }
  return before
}
export function loadDemo(storage: Storage, date: string, confirmed: boolean) {
  if (!confirmed) throw Error('Bitte das Laden der fiktiven Demo-Kita ausdrücklich bestätigen.')
  const before = demoAvailability(storage), demo = buildDemo(date)
  const next = Object.fromEntries(AREAS.map(key => [key, JSON.stringify(demo.payload[key])]))
  const written: string[] = []
  function unchanged() {
    localOnly(storage)
    if (AREAS.some(key => storage.getItem(key) !== (written.includes(key) ? next[key] : before[key]))) throw Error('Lokaler Bestand inzwischen geändert.')
  }
  try {
    for (const key of AREAS) { unchanged(); storage.setItem(key, next[key]); written.push(key) }
    unchanged()
  } catch {
    let restored = true
    for (const key of written.reverse()) {
      try {
        if (storage.getItem(key) !== next[key]) { restored = false; continue }
        if (before[key] === null) storage.removeItem(key); else storage.setItem(key, before[key]!)
      } catch { restored = false }
    }
    throw Error(restored ? 'Demo-Laden abgebrochen. Der ursprüngliche lokale Zustand wurde erhalten.' : 'Demo-Laden fehlgeschlagen; Wiederherstellung teilweise blockiert. Bitte lokale Datenverwaltung prüfen, keine erfolgreiche Demo-Übernahme.')
  }
  return demo
}
