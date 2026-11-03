import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/modules/dienstplan/staffing.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { calculateStaffing, staffingStatus, criticalWindows } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const date = '2027-01-04'
const setup = { version: 1, completed: true, careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g1', name: 'Sonne', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }, { id: 'g2', name: 'Mond', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] }
const shift = (id, employeeId, groupId, patch = {}) => ({ id, employeeId, groupId, date, start: '07:00', end: '10:00', breakMinutes: 0, ...patch })
const employees = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const baseline = [shift('s1', 'a', 'g1'), shift('s2', 'b', 'g2')]
const run = (shifts = baseline, absences = [], settings = setup, people = employees, unavailable = false) => calculateStaffing(date, settings, shifts, absences, people, unavailable)
const at = (day, start, area) => day.windows.find(window => window.start === start && window.area === area)
const absence = (portion) => ({ id: 'a1', employeeId: 'a', employeeName: 'Anna', type: 'vacation', startDate: date, endDate: date, portion })

test('Soll/Ist: Unter-, passende und Überbesetzung; gemeinsame Betreuung zählt Personen nur einmal', () => {
  assert.equal(staffingStatus(2, 1, false), 'under')
  assert.equal(staffingStatus(2, 2, false), 'matched')
  assert.equal(staffingStatus(2, 3, false), 'over')
  assert.equal(staffingStatus(2, 2, true), 'check')
  const day = run()
  assert.equal(at(day, 420, 'early').actual, 2)
  assert.equal(at(day, 420, 'early').status, 'over')
  assert.equal(at(day, 480, 'group:g1').status, 'matched')
  assert.equal(at(day, 480, 'group:g2').status, 'matched')
  assert.equal(at(day, 540, 'late').actual, 2)
  assert.equal(day.windows.filter(window => window.start === 420).length, 1)
  const duplicate = run([...baseline, shift('duplicate', 'a', 'g2')])
  assert.equal(at(duplicate, 420, 'early').actual, 2)
  assert.equal(at(duplicate, 480, 'group:g1').status, 'check')
  assert.equal(at(duplicate, 480, 'group:g2').status, 'check')
  assert.equal(at(run([]), 480, 'group:g1').status, 'under')
})

test('Exakte Intervallgrenzen und Wechsel mitten im Viertelstundenraster', () => {
  const day = run([shift('s1', 'a', 'g1', { start: '08:15', end: '08:30' })])
  assert.equal(at(day, 480, 'group:g1').actual, 0)
  assert.equal(at(day, 495, 'group:g1').actual, 1)
  assert.equal(at(day, 510, 'group:g1').actual, 0)
  const offGrid = run([shift('s1', 'a', 'g1', { start: '08:07', end: '08:22' })])
  assert.equal(at(offGrid, 480, 'group:g1').actual, 0)
  assert.equal(at(offGrid, 487, 'group:g1').actual, 1)
  assert.equal(at(offGrid, 502, 'group:g1').actual, 0)
  assert.ok(offGrid.windows.every(window => window.end - window.start <= 15))
  const changed = structuredClone(setup)
  changed.groups[0].periods = [{ start: '08:00', end: '08:20', minimum: 1 }, { start: '08:20', end: '09:00', minimum: 2 }]
  assert.equal(at(run(baseline, [], changed), 500, 'group:g1').status, 'under')
})

test('Ganztage schließen aus; Halbtage, Pausen und fehlende Daten bleiben ungeklärt', () => {
  assert.equal(at(run(baseline, [absence('full')]), 480, 'group:g1').actual, 0)
  assert.equal(at(run(baseline, [absence('full')]), 480, 'group:g1').status, 'under')
  for (const portion of ['am', 'pm']) {
    const day = run(baseline, [absence(portion)])
    for (const window of day.windows.filter(window => window.area === 'group:g1')) {
      assert.equal(window.status, 'check'); assert.equal(window.actual, 0); assert.equal(window.possible, 1)
    }
    assert.equal(at(day, 480, 'group:g2').status, 'matched')
  }
  const paused = run([{ ...baseline[0], breakMinutes: 30 }, baseline[1]])
  assert.equal(paused.status, 'check')
  assert.equal(at(paused, 480, 'group:g1').status, 'check')
  assert.equal(at(paused, 540, 'late').status, 'check')
  assert.equal(at(run(baseline, [], setup, [], true), 480, 'group:g1').status, 'check')
  assert.equal(at(run(baseline, [], setup, []), 480, 'group:g1').status, 'check')
  const orphan = run([shift('s1', 'a', 'gone')])
  assert.equal(at(orphan, 480, 'group:g1').status, 'check')
})

test('Fehlende Sollwerte sind nicht konfiguriert; geschlossene Tage und Detailverdichtung ohne Datenmutation', () => {
  const before = JSON.stringify({ setup, baseline, employees })
  assert.equal(run(baseline, [], null).status, 'unconfigured')
  assert.equal(run(baseline, [], { ...setup, completed: false }).status, 'unconfigured')
  const missing = structuredClone(setup); missing.groups[0].periods = []
  assert.equal(at(run(baseline, [], missing), 480, 'group:g1').status, 'unconfigured')
  missing.groups[0].periods = [{ start: '08:00', end: '09:00', minimum: 0 }]
  assert.equal(at(run(baseline, [], missing), 480, 'group:g1').required, null)
  assert.equal(calculateStaffing('2027-01-05', setup, baseline, [], employees).status, 'closed')
  assert.equal(calculateStaffing('2027-01-09', { ...setup, careDays: undefined }, [], [], employees).status, 'closed')
  const windows = run([]).windows
  const condensed = criticalWindows(windows)
  assert.equal(condensed.length, 4) // early, 2 core groups, late
  assert.equal(condensed[0].start, 420); assert.equal(condensed[0].end, 480)
  assert.equal(windows[0].end, 435)
  assert.equal(JSON.stringify({ setup, baseline, employees }), before)
})
