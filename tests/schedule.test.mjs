import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarWeek, addDays, localDate, loadShifts, SHIFTS_KEY, dayEntries, schedulePeople } from '../src/modules/dienstplan/schedule.ts'

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
  for (const value of [{ ...shift, breakMinutes: -1 }, { ...shift, breakMinutes: 480 }, { ...shift, date: '2027-02-30' }, { ...shift, end: '07:00' }]) {
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
