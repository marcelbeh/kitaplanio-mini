import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { newEmployee, saveEmployee, EMPLOYEES_KEY } from '../src/modules/mitarbeiter/employees.ts'
import { newSetup, saveSetup, STORAGE_KEY } from '../src/modules/kita/setup.ts'
const result = await build({ entryPoints: ['src/modules/dienstplan/schedule.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { calendarWeek, addDays, localDate, loadShifts, SHIFTS_KEY, dayEntries, schedulePeople, validateShift, workTime, formatMinutes, saveShift, deleteShift, overlappingShifts, shiftWarnings, visibleScheduleDays } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

const shift = { id: 's-1', employeeId: 'e-1', groupId: 'g-1', date: '2027-01-04', start: '08:00', end: '16:00', breakMinutes: 30 }
test('ISO-Wochen am Jahreswechsel und Kalenderarithmetik über Sommerzeit/Schaltjahr', () => {
  for (const [date, monday, week, year] of [['2027-01-01', '2026-12-28', 53, 2026], ['2027-01-03', '2026-12-28', 53, 2026], ['2027-01-04', '2027-01-04', 1, 2027], ['2024-12-30', '2024-12-30', 1, 2025]]) {
    const actual = calendarWeek(date)
    assert.deepEqual([actual.monday, actual.week, actual.year], [monday, week, year])
    assert.equal(actual.days.length, 7)
    assert.equal(actual.days[6], addDays(monday, 6))
  }
  assert.equal(addDays('2026-03-29', 1), '2026-03-30')
  assert.equal(addDays('2026-10-25', -1), '2026-10-24')
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
  assert.equal(localDate(new Date(2026, 10, 3, 0, 1)), '2026-11-03')
  assert.equal(localDate(new Date(2026, 10, 3, 23, 59)), '2026-11-03')
})

test('Schichten rein lesend: fehlende Daten, Pause, mehrere Schichten und beschädigte Versionen', () => {
  let raw = null
  const storage = { getItem(key) { assert.equal(key, SHIFTS_KEY); return raw }, setItem() { assert.fail('Ansicht darf niemals schreiben') } }
  assert.deepEqual(loadShifts(storage), [])
  raw = JSON.stringify({ version: 1, shifts: [{ ...shift, id: 'later', start: '17:00', end: '18:00', breakMinutes: 0 }, shift] })
  assert.deepEqual(loadShifts(storage).map(item => item.id), ['s-1', 'later'])
  for (const value of [{ ...shift, breakMinutes: -1 }, { ...shift, breakMinutes: 481 }, { ...shift, date: '2027-02-30' }, { ...shift, end: '07:00' }]) {
    raw = JSON.stringify({ version: 1, shifts: [value] }); assert.throws(() => loadShifts(storage)); assert.equal(JSON.parse(raw).shifts.length, 1)
  }
  for (const value of ['broken', '{"version":2,"shifts":[]}', JSON.stringify({ version: 1, shifts: [shift, shift] })]) { raw = value; assert.throws(() => loadShifts(storage)); assert.equal(raw, value) }
})

test('Tagesdaten enthalten alle Schichten und inklusive Abwesenheiten, historische Personen bleiben sichtbar', () => {
  const employees = [{ id: 'e-2', name: 'Bea', groupId: 'g-1' }]
  const absence = { id: 'a-1', employeeId: 'e-2', employeeName: 'Bea', startDate: '2027-01-04', endDate: '2027-01-05', portion: 'am', type: 'vacation' }
  const historical = { ...shift, employeeName: 'Anna' }
  const people = schedulePeople(employees, [historical], [absence], '2027-01-04', '2027-01-10')
  assert.deepEqual(people.map(item => item.name), ['Anna', 'Bea'])
  assert.equal(people[0].historical, true)
  assert.equal(dayEntries('e-2', '2027-01-05', [shift], [absence]).absences.length, 1)
  assert.equal(dayEntries('e-2', '2027-01-06', [shift], [absence]).absences.length, 0)
  assert.equal(dayEntries('e-1', '2027-01-04', [shift, { ...shift, id: 's-2' }], [absence]).shifts.length, 2)
  assert.deepEqual(schedulePeople([], [shift], [], '2027-02-01', '2027-02-05'), [])
})

function memory() {
  const data = new Map()
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
function seeded() {
  const storage = memory()
  const setup = { ...newSetup(), completed: true, opening: { start: '07:00', end: '17:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '16:00', end: '17:00', minimum: 1 }, groups: [{ id: 'g-1', name: 'Sonne', periods: [{ start: '08:00', end: '16:00', minimum: 1 }] }] }
  saveSetup(storage, setup, null)
  for (const id of ['e-1', 'e-2']) saveEmployee(storage, { ...newEmployee(id), name: id, groupId: 'g-1', qualification: 'Erzieherin', weeklyMinutes: 1200, workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], availability: { start: '07:00', end: '17:00' } }, setup.groups, 'create')
  return storage
}

test('Arbeitszeit minutengenau: mehrere Schichten, optionale/volle Pause, Tages- und Wochensumme', () => {
  const second = { ...shift, id: 's-2', start: '16:00', end: '17:15', breakMinutes: undefined }
  assert.deepEqual(workTime([shift, second]), { gross: 555, pause: 30, net: 525 })
  assert.equal(formatMinutes(workTime([shift, second]).net), '08:45')
  assert.equal(formatMinutes(workTime(Array(5).fill(shift)).net), '37:30')
  assert.deepEqual(workTime([]), { gross: 0, pause: 0, net: 0 })
  assert.equal(workTime([{ ...shift, breakMinutes: 480 }]).net, 0)
  assert.equal(validateShift({ ...shift, breakMinutes: 480 }).length, 0)
  for (const patch of [{ start: '16:00' }, { end: '07:00' }, { breakMinutes: -1 }, { breakMinutes: 481 }, { breakMinutes: 0.5 }, { breakMinutes: NaN }]) assert.ok(validateShift({ ...shift, ...patch }).length)
})

test('CRUD erhält Stammdaten/andere Tage, liest P5a ohne Pause, verhindert Überschneidungen und veraltete Änderungen', () => {
  const storage = seeded()
  const master = [storage.getItem(EMPLOYEES_KEY), storage.getItem(STORAGE_KEY)]
  const legacy = { ...shift }; delete legacy.breakMinutes
  storage.setItem(SHIFTS_KEY, JSON.stringify({ version: 1, shifts: [legacy] }))
  assert.equal(loadShifts(storage)[0].breakMinutes, undefined)
  const tomorrow = { ...shift, id: 'tomorrow', date: '2027-01-05' }
  const adjacent = { ...shift, id: 'adjacent', start: '16:00', end: '17:00', breakMinutes: 0 }
  saveShift(storage, tomorrow, 'create')
  saveShift(storage, adjacent, 'create')
  saveShift(storage, { ...shift, id: 'another-person', employeeId: 'e-2' }, 'create')
  assert.throws(() => saveShift(storage, { ...shift, id: 'overlap' }, 'create'), /Zeitüberschneidung/)
  assert.equal(overlappingShifts(shift, [shift, adjacent, tomorrow]).length, 0)
  const original = loadShifts(storage).find(item => item.id === shift.id)
  saveShift(storage, { ...original, breakMinutes: 45 }, 'update', original)
  assert.throws(() => saveShift(storage, { ...original, breakMinutes: 60 }, 'update', original), /inzwischen geändert/)
  assert.throws(() => deleteShift(storage, original), /inzwischen geändert/)
  assert.deepEqual(loadShifts(storage).find(item => item.id === tomorrow.id), { ...tomorrow, employeeName: 'e-1' })
  deleteShift(storage, loadShifts(storage).find(item => item.id === shift.id))
  assert.equal(loadShifts(storage).length, 3)
  assert.deepEqual([storage.getItem(EMPLOYEES_KEY), storage.getItem(STORAGE_KEY)], master)
  for (const raw of ['broken', '{"version":2,"shifts":[]}']) {
    storage.setItem(SHIFTS_KEY, raw)
    assert.throws(() => saveShift(storage, shift, 'create'))
    assert.throws(() => deleteShift(storage, tomorrow))
    assert.equal(storage.getItem(SHIFTS_KEY), raw)
  }
  const unavailable = { getItem: storage.getItem, setItem() { throw Error('Speicher voll') } }
  storage.setItem(SHIFTS_KEY, '{"version":1,"shifts":[]}')
  assert.throws(() => saveShift(unavailable, shift, 'create'), /Speicher voll/)
  assert.deepEqual(loadShifts(storage), [])
})

test('Abwesenheiten und wiederkehrende Termine warnen ohne Speicherung zu verbieten', () => {
  const absence = { id: 'a-1', employeeId: 'e-1', employeeName: 'Anna', startDate: shift.date, endDate: shift.date, portion: 'am', type: 'vacation' }
  const event = { id: 'event-1', title: 'Teamrunde', date: '2026-12-28', start: '15:00', end: '16:00', note: '', type: 'meeting', wholeTeam: false, employeeIds: [], groupIds: ['g-1'], recurrence: 'weekly', until: '2027-01-04' }
  const hints = shiftWarnings(shift, [absence], [event], [])
  assert.equal(hints.length, 2)
  assert.match(hints[0], /halbtags/)
  assert.match(hints[1], /Teamrunde/)
  assert.equal(shiftWarnings(shift, [{ ...absence, employeeId: 'e-2' }], [{ ...event, start: '16:00', end: '17:00' }], []).length, 0)
  assert.equal(shiftWarnings(shift, [], [{ ...event, groupIds: ['other'] }], []).length, 0)
  const storage = seeded()
  storage.setItem('kitaplanio-lite:absences:v1', JSON.stringify({ version: 1, absences: [absence] }))
  storage.setItem('kitaplanio-lite:events:v1', JSON.stringify({ version: 1, events: [event] }))
  saveShift(storage, shift, 'create')
  assert.equal(loadShifts(storage).length, 1)
  assert.equal(JSON.parse(storage.getItem('kitaplanio-lite:events:v1')).events[0].date, event.date)
})

test('Wochenenddienste: Sichtbarkeit durch Schicht, Termin oder Auswahl; Zeiten zählen für Samstag und Sonntag', () => {
  const dates = calendarWeek('2027-01-04').days
  assert.deepEqual(visibleScheduleDays(dates, dates[0], [], [], []), dates.slice(0, 5))
  const saturday = { ...shift, id: 'sat', date: dates[5], start: '09:00', end: '12:00', breakMinutes: 15 }
  const sunday = { ...shift, id: 'sun', date: dates[6], start: '10:00', end: '12:00', breakMinutes: 0 }
  for (const index of [5, 6]) {
    assert.deepEqual(visibleScheduleDays(dates, dates[index], [], [], []), dates)
    assert.deepEqual(visibleScheduleDays(dates, dates[0], [], [], [dates[index]]), dates)
    assert.deepEqual(visibleScheduleDays(dates, dates[0], [{ ...shift, date: dates[index] }], [], []), dates)
  }
  assert.equal(dayEntries('e-1', dates[5], [saturday, sunday], []).shifts[0].id, 'sat')
  assert.equal(dayEntries('e-1', dates[6], [saturday, sunday], []).shifts[0].id, 'sun')
  assert.equal(formatMinutes(workTime([saturday, sunday]).net), '04:45')
  assert.equal(formatMinutes(workTime([shift, saturday, sunday]).net), '12:15')
  assert.deepEqual(visibleScheduleDays(dates, dates[0], [{ ...shift, date: '2027-01-16' }], [], ['2027-01-17']), dates.slice(0, 5))
})
