import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/modules/dienstplan/checks.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { checkPlan, inspectStoredShifts } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const from = '2027-01-04', to = '2027-01-10'
const person = { id: 'a', name: 'Anna', groupId: 'g', weeklyMinutes: 480, workdays: ['mon'], availability: { start: '07:00', end: '22:00' }, fixedTimes: {}, rules: [] }
const shift = (id, date = from, start = '08:00', end = '16:00', patch = {}) => ({ id, date, start, end, employeeId: 'a', groupId: 'g', breakMinutes: 0, ...patch })
const run = (entries, patch = {}) => checkPlan({ from, to, employees: [person], absences: [], setup: null, inspection: { entries }, ...patch })
const by = (issues, prefix) => issues.filter(issue => issue.id.startsWith(prefix))

test('Überschneidungen (auch verschachtelt), Abwesenheiten und Verfügbarkeiten sind harte, eindeutige Konflikte', () => {
  const entries = [shift('long'), shift('short1', from, '09:00', '10:00'), shift('short2', from, '11:00', '12:00')]
  const absences = [{ id: 'abs', employeeId: 'a', startDate: from, endDate: from, portion: 'full' }]
  const issues = run(entries, { absences })
  assert.equal(by(issues, 'overlap:').length, 2)
  assert.ok(by(issues, 'overlap:').every(issue => issue.kind === 'conflict'))
  assert.equal(by(issues, 'absence:').length, 1)
  assert.equal(new Set(issues.map(issue => issue.id)).size, issues.length)
  assert.equal(by(run([shift('first', from, '08:00', '10:00'), shift('second', from, '10:00', '12:00')]), 'overlap:').length, 0)
  assert.equal(by(run([shift('outside', from, '06:00', '08:00')]), 'availability:')[0].kind, 'conflict')
  const fixed = { ...person, fixedTimes: { mon: { start: '08:00', end: '16:00' } } }
  assert.equal(by(run([shift('fixed', from, '09:00', '16:00')], { employees: [fixed] }), 'fixed:')[0].kind, 'conflict')
  assert.equal(by(run([shift('fixed')], { employees: [fixed] }), 'fixed:').length, 0)
})

test('Wochenend-Sonderdienste zählen in Wochenzeit und konfigurierter Ruheprüfung, auch über Wochenränder', () => {
  const entries = [shift('sat', '2027-01-09', '18:00', '22:00'), shift('sun', '2027-01-10', '07:00', '11:00')]
  assert.equal(by(run(entries), 'hours:').length, 0)
  assert.equal(by(run(entries), 'availability:').length, 0)
  assert.equal(by(run(entries), 'rest:').length, 0) // no implicit threshold
  const issues = run([...entries, shift('next', '2027-01-11', '07:00', '09:00')], { options: { minRestMinutes: 600, maxShiftMinutes: 180 } })
  assert.equal(by(issues, 'rest:').length, 1)
  assert.match(by(issues, 'rest:')[0].cause, /09:00/)
  assert.equal(by(issues, 'long:').length, 2)
  assert.ok(by(issues, 'demand:').filter(issue => ['2027-01-09', '2027-01-10'].includes(issue.date)).every(issue => issue.kind === 'hint'))
  assert.equal(by(run([shift('previous', '2027-01-03', '20:00', '22:00'), shift('monday', from, '07:00', '09:00')], { options: { minRestMinutes: 600 } }), 'rest:').length, 1)
  const halves = run(entries, { absences: [{ employeeId: 'a', startDate: '2027-01-09', endDate: '2027-01-09', portion: 'am' }] })
  assert.equal(by(halves, 'half:')[0].kind, 'hint')
})

test('Pausen, Vertragszeit und Freitext bleiben Hinweise; unkonfigurierte Grenzwerte werden übersprungen', () => {
  const entries = [shift('pause', from, '08:00', '12:00', { breakMinutes: 30 }), shift('different', '2027-01-05', '08:00', '10:00')]
  const issues = run(entries, { employees: [{ ...person, rules: [{ id: 'free', type: 'must', weekday: null, description: 'Bitte im Team abstimmen' }] }] })
  assert.equal(by(issues, 'pause:')[0].kind, 'hint')
  assert.match(by(issues, 'hours:')[0].cause, /05:30/)
  assert.equal(by(issues, 'distribution:')[0].kind, 'hint')
  assert.equal(by(issues, 'text:')[0].kind, 'hint')
  assert.equal(by(issues, 'long:').length, 0)
  assert.equal(by(issues, 'rest:').length, 0)
  const before = JSON.stringify(entries)
  assert.deepEqual(run(entries), run(entries))
  assert.equal(JSON.stringify(entries), before)
})

test('Explizite Mindestbesetzung nutzt P5c, unklare Besetzung wird nicht zum erfundenen harten Verstoß', () => {
  const setup = { version: 1, completed: true, careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g', name: 'Sonne', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] }
  const issues = run([shift('cover', from, '07:00', '10:00')], { setup })
  assert.equal(by(issues, 'staff:').length, 0)
  assert.ok(by(run([], { setup }), 'staff:').every(issue => issue.kind === 'conflict'))
  assert.equal(by(run([shift('unclear', from, '07:00', '10:00', { breakMinutes: 30 })], { setup }), 'staff:').length, 0)
  assert.equal(by(run([], { setup: null }), 'staff:').length, 0)
})

test('Ungültige Rohdaten werden trotz strengem P5a-Lader geprüft und niemals überschrieben', () => {
  let raw = JSON.stringify({ version: 1, shifts: [{ ...shift('bad'), end: '06:00' }, { id: 'missing', date: from, employeeId: 'a' }] })
  const storage = { getItem() { return raw }, setItem() { assert.fail('Keine Mutation erlaubt') } }
  const inspection = inspectStoredShifts(storage)
  assert.equal(by(run([], { inspection }), 'invalid:').length, 2)
  assert.ok(by(run([], { inspection }), 'invalid:').every(issue => issue.kind === 'conflict' && issue.person === 'Anna'))
  assert.equal(by(run([shift('same'), shift('same')]), 'duplicate:').length, 1)
  const before = raw
  checkPlan({ from, to, employees: [person], absences: [], setup: null, inspection })
  assert.equal(raw, before)
  for (const value of ['broken', '{"version":2,"shifts":[]}']) {
    raw = value
    assert.equal(by(run([], { inspection: inspectStoredShifts(storage) }), 'store')[0].kind, 'conflict')
    assert.equal(raw, value)
  }
  assert.match(inspectStoredShifts({ getItem() { throw Error('SecurityError') } }).problem, /nicht lesbar/)
})
