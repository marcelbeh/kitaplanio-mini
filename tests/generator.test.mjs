import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/modules/dienstplan/generator.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { readGeneratorContext, generateProposal, proposalIssues, proposalCoverage, adoptProposal } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const date = '2027-01-04'
const key = 'kitaplanio-lite:shifts:v1'
const setup = { version: 1, completed: true, careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: ['g1','g2'].map(id => ({ id, name: id, periods: [{ start: '08:00', end: '09:00', minimum: 1 }] })) }
const employee = (id, groupId) => ({ id, name: id, groupId, qualification: 'Erzieherin', weeklyMinutes: 600, workdays: ['mon'], availability: { start: '07:00', end: '22:00' }, fixedTimes: {}, rules: [] })
const shift = { id: 'existing', employeeId: 'a', employeeName: 'a', groupId: 'g1', date, start: '07:00', end: '08:00', breakMinutes: 0 }
function seeded(patch = {}) {
  const values = new Map([
    ['kitaplanio-lite:kita:v1', JSON.stringify(patch.setup ?? setup)],
    ['kitaplanio-lite:employees:v1', JSON.stringify({ version: 1, employees: patch.employees ?? [employee('a','g1'), employee('b','g2')] })],
    [key, JSON.stringify({ version: 1, shifts: patch.shifts ?? [shift] })],
    ['kitaplanio-lite:absences:v1', JSON.stringify({ version: 1, absences: patch.absences ?? [] })],
  ])
  let writes = 0
  return { values, get writes() { return writes }, getItem: key => values.get(key) ?? null, setItem(key,value) { writes++; values.set(key,value) } }
}
function draft(storage, demands = []) { const context = readGeneratorContext(storage); return { context, proposal: generateProposal(context, date, demands) } }

test('Deterministisch: ergänzt nur Fehlbedarf, bestehende Schichten und alle Quelldaten bleiben unverändert', () => {
  const storage = seeded(), before = [...storage.values]
  const first = draft(storage), second = draft(storage)
  assert.deepEqual(first, second)
  assert.ok(first.proposal.shifts.length > 0)
  assert.equal(proposalCoverage(first.context, first.proposal).length, 0)
  assert.equal(proposalIssues(first.context, first.proposal).filter(issue => issue.kind === 'conflict').length, 0)
  assert.deepEqual(first.context.shifts, [shift])
  assert.ok(first.proposal.shifts.every(item => item.date === date && item.breakMinutes === undefined && item.id !== shift.id))
  const all = [...first.context.shifts, ...first.proposal.shifts]
  assert.ok(!all.some((a,i) => all.some((b,j) => i < j && a.employeeId === b.employeeId && a.date === b.date && a.start < b.end && b.start < a.end)))
  assert.deepEqual([...storage.values], before); assert.equal(storage.writes, 0)
})

test('Abwesenheiten, unklare Halbtage, Muss-Freitext, feste Zeiten und Vertragsgrenzen erzeugen transparente Lücken', () => {
  const absence = { id: 'abs', employeeId: 'a', employeeName: 'a', startDate: date, endDate: date, type: 'vacation', portion: 'full' }
  for (const portion of ['full','am','pm']) {
    const plan = draft(seeded({ shifts: [], absences: [{ ...absence, portion }] }))
    assert.ok(!plan.proposal.shifts.some(item => item.employeeId === 'a'))
    assert.ok(proposalCoverage(plan.context, plan.proposal).length > 0)
    assert.ok(plan.proposal.reasons.some(reason => reason.includes('Abwesenheit')))
  }
  for (const person of [{ ...employee('a','g1'), weeklyMinutes: 30 }, { ...employee('a','g1'), weeklyMinutes: 180, fixedTimes: { mon: { start: '07:00', end: '10:00' } } }, { ...employee('a','g1'), rules: [{ id: 'rule', type: 'must', weekday: null, description: 'Manuell prüfen' }] }]) {
    const plan = draft(seeded({ shifts: [], employees: [person,employee('b','g2')] }))
    assert.ok(proposalCoverage(plan.context, plan.proposal).length > 0)
    assert.ok(plan.proposal.reasons.length > 0)
  }
  const unclear = draft(seeded({ shifts: [{ ...shift, start: '08:00', end: '09:00', breakMinutes: 15 }] }))
  assert.ok(!unclear.proposal.shifts.some(item => item.employeeId === 'a' && item.start < '09:00' && item.end > '08:00'))
  assert.ok(proposalCoverage(unclear.context, unclear.proposal).some(window => window.status === 'check'))
})

test('Wochenenden ausschließlich mit explizitem Sonderbedarf, auch außerhalb regulärer Öffnungszeiten', () => {
  const storage = seeded()
  assert.ok(draft(storage).proposal.shifts.every(shift => !['2027-01-09','2027-01-10'].includes(shift.date)))
  const demands = ['2027-01-09','2027-01-10'].map(date => ({ date, groupId: 'g1', start: '18:00', end: '20:00', minimum: 1 }))
  const plan = draft(storage, demands)
  for (const date of demands.map(demand => demand.date)) assert.ok(plan.proposal.shifts.some(shift => shift.date === date && shift.start === '18:00' && shift.end === '20:00'))
  assert.equal(proposalCoverage(plan.context, plan.proposal).length, 0)
  assert.equal(proposalIssues(plan.context, plan.proposal).filter(issue => issue.kind === 'conflict').length, 0)
  const invalid = draft(storage, [{ ...demands[0], minimum: 0 }])
  assert.equal(invalid.proposal.shifts.length, 0)
  assert.ok(invalid.proposal.reasons.some(reason => reason.includes('Sollwert')))
})

test('Freigabe benötigt Bestätigung, blockiert Konflikte und geänderte Quellen; Fehler schreiben nichts', () => {
  const storage = seeded(), before = [...storage.values], plan = draft(storage)
  assert.throws(() => adoptProposal(storage, plan), /bestätigt/)
  assert.equal(storage.writes, 0)
  const bad = { ...plan, proposal: { ...plan.proposal, shifts: [...plan.proposal.shifts, { ...shift, id: 'overlap' }] } }
  assert.throws(() => adoptProposal(storage, bad, {}, true), /Harte Konflikte/)
  assert.equal(storage.writes, 0)
  for (const source of ['kitaplanio-lite:kita:v1', 'kitaplanio-lite:employees:v1', key, 'kitaplanio-lite:absences:v1', 'kitaplanio-lite:events:v1']) {
    const other = seeded(), current = draft(other)
    other.values.set(source, 'changed')
    assert.throws(() => adoptProposal(other, current, {}, true), /inzwischen geändert/)
    assert.equal(other.writes, 0)
  }
  const failing = { getItem: storage.getItem, setItem() { throw Error('Speicher voll') } }
  assert.throws(() => adoptProposal(failing, plan, {}, true), /Speicher voll/)
  assert.deepEqual([...storage.values], before)
  const incomplete = draft(seeded({ employees: [employee('a','g1')], shifts: [] }))
  assert.throws(() => adoptProposal(seeded({ employees: [employee('a','g1')], shifts: [] }), incomplete, {}, true), /Harte Konflikte/)
})

test('Manuell geänderter/entfernter Entwurf bleibt temporär; bestätigte Übernahme schreibt alle neuen Schichten einmalig', () => {
  const storage = seeded(), plan = draft(storage), original = storage.getItem(key)
  const edited = { ...plan, proposal: { ...plan.proposal, shifts: plan.proposal.shifts.map(item => ({ ...item, breakMinutes: 0 })) } }
  const removed = { ...edited, proposal: { ...edited.proposal, shifts: edited.proposal.shifts.slice(1) } }
  assert.equal(storage.getItem(key), original); assert.equal(storage.writes, 0)
  assert.ok(proposalCoverage(removed.context, removed.proposal).length > 0)
  const count = adoptProposal(storage, edited, {}, true)
  assert.equal(count, plan.proposal.shifts.length); assert.equal(storage.writes, 1)
  const saved = JSON.parse(storage.getItem(key)).shifts
  assert.deepEqual(saved.find(item => item.id === shift.id), shift)
  assert.equal(saved.length, count + 1)
  assert.equal(storage.values.size, 4) // no draft or new configuration keys
  assert.throws(() => adoptProposal(storage, edited, {}, true), /inzwischen geändert/)
  assert.equal(storage.writes, 1)
})
