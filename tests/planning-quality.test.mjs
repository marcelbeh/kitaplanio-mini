import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({ stdin: { contents: `export * from './src/modules/dienstplan/generator.ts'; export * from './src/modules/dienstplan/staffing.ts'; export * from './src/modules/dienstplan/presentation.ts'; export { checkPlan } from './src/modules/dienstplan/checks.ts'; export { teamPlan } from './src/modules/dienstplan/publications.ts';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' })
const { readGeneratorContext, generateProposal, adoptProposal, calculateStaffing, checkPlan, netTimeLabel, isDefiniteShortage, teamPlan } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const from = '2027-01-04', to = '2027-01-10', key = 'kitaplanio-lite:shifts:v1', pubKey = 'caro:published-weeks:v1'
const setup = { version: 1, completed: true, careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g', name: 'Sonne', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] }
const person = { id: 'p', name: 'Testperson', groupId: 'g', qualification: 'Test', weeklyMinutes: 600, workdays: ['mon'], availability: { start: '07:00', end: '18:00' }, fixedTimes: {}, rules: [] }
const shift = { id: 's', employeeId: 'p', groupId: 'g', date: from, start: '07:00', end: '10:00' }
function storage({ shifts = [], fail = false, settings = setup } = {}) {
  const values = new Map([
    ['kitaplanio-lite:kita:v1', JSON.stringify(settings)], ['kitaplanio-lite:employees:v1', JSON.stringify({ version: 1, employees: [person] })],
    [key, JSON.stringify({ version: 1, shifts })], ['kitaplanio-lite:absences:v1', JSON.stringify({ version: 1, absences: [] })],
  ])
  let writes = 0
  return { values, get writes() { return writes }, getItem: key => values.get(key) ?? null, setItem(key, value) { if (fail) throw Error('quota'); values.set(key, value); writes++ } }
}
const draft = store => { const context = readGeneratorContext(store); return { context, proposal: generateProposal(context, from) } }
const issues = (entries, settings = setup, absences = [], errors = []) => checkPlan({ from, to, setup: settings, employees: [person], absences, inspection: { entries }, errors })

test('Fehlende Pause ist weder bestätigte Nullpause noch exakte Nettozeit; Eingaben und Rechenbasis bleiben erhalten', () => {
  const before = JSON.stringify(shift)
  assert.match(netTimeLabel([shift]), /ungeklärt/)
  assert.equal(netTimeLabel([{ ...shift, breakMinutes: 0 }]), '03:00')
  assert.equal(netTimeLabel([{ ...shift, breakMinutes: 30 }]), '02:30')
  assert.match(netTimeLabel([{ ...shift, breakMinutes: 30 }, { ...shift, id: 's2', start: '11:00', end: '12:00' }]), /ungeklärt/)
  const result = issues([shift])
  assert.equal(result.filter(issue => issue.id.startsWith('missing-pause:')).length, 1)
  assert.ok(!result.some(issue => issue.id.startsWith('hours:') || issue.id.startsWith('distribution:')))
  assert.equal(JSON.stringify(shift), before)
})

test('Ampel unterscheidet unbekannte, positive und explizite Nullpause ohne Zeitpunkte zu erfinden', () => {
  for (const breakMinutes of [undefined, 30, 0]) {
    const day = calculateStaffing(from, setup, [{ ...shift, breakMinutes }], [], [person])
    assert.equal(day.status, breakMinutes === 0 ? 'matched' : 'check')
    assert.ok(day.windows.every(window => window.actual === (breakMinutes === 0 ? 1 : 0) && window.possible === 1))
  }
})

test('Sichere Unterbesetzung bleibt Konflikt trotz unklarer Pause/Halbtag; hinreichend mögliche Besetzung bleibt ungeklärt', () => {
  const settings = { ...setup, early: { ...setup.early, minimum: 2 }, late: { ...setup.late, minimum: 2 }, groups: [{ ...setup.groups[0], periods: [{ start: '08:00', end: '09:00', minimum: 2 }] }] }
  const absences = [{ id: 'a', employeeId: 'p', employeeName: person.name, type: 'vacation', startDate: from, endDate: from, portion: 'am' }]
  for (const [entry, away] of [[shift, []], [{ ...shift, breakMinutes: 30 }, []], [{ ...shift, breakMinutes: 0 }, absences]]) {
    const day = calculateStaffing(from, settings, [entry], away, [person])
    assert.equal(day.status, 'check'); assert.ok(day.windows.every(isDefiniteShortage))
    const found = issues([entry], settings, away).filter(issue => issue.id.startsWith('staff:'))
    assert.ok(found.length); assert.ok(found.every(issue => issue.kind === 'conflict' && issue.cause.includes('höchstens 1')))
  }
  assert.equal(issues([shift]).filter(issue => issue.id.startsWith('staff:')).length, 0)
  assert.equal(issues([shift], settings, [], ['Mitarbeiterdaten unvollständig']).filter(issue => issue.id.startsWith('staff:')).length, 0)
  assert.equal(calculateStaffing('2027-01-09', settings, [{ ...shift, date: '2027-01-09' }], [], [person]).status, 'unspecified')
})

test('Generator sperrt veröffentlichte Wochen und erkennt Freigabe/Arbeitsbereich/Datenänderung nach Vorschau', () => {
  for (const area of [pubKey, 'caro:sync-active:v1', key]) {
    const store = storage(), proposed = draft(store), original = store.getItem(key)
    if (area === pubKey) store.values.set(area, JSON.stringify({ version: 1, plans: [{ ...teamPlan(proposed.context, from), version: 1, publishedAt: '2027-01-01T12:00:00Z' }] }))
    else store.values.set(area, area === key ? JSON.stringify({ version: 1, shifts: [{ ...shift, breakMinutes: 0 }] }) : 'other-workspace')
    assert.throws(() => adoptProposal(store, proposed, {}, true)); assert.equal(store.writes, 0)
    if (area !== key) assert.equal(store.getItem(key), original)
    if (area === pubKey) assert.throws(() => draft(store), /veröffentlicht/)
  }
})

test('Bestätigung, genau eine KW und atomarer Fehlerfall; bestehende Dienste bleiben identisch', () => {
  const store = storage({ shifts: [{ ...shift, id: 'later', date: '2027-01-11', breakMinutes: 15 }] }), proposed = draft(store), before = [...store.values]
  assert.throws(() => adoptProposal(store, proposed), /bestätigt/)
  assert.throws(() => adoptProposal(store, { ...proposed, proposal: { ...proposed.proposal, to: '2027-01-17' } }, {}, true), /Kalenderwoche/)
  assert.deepEqual([...store.values], before)
  assert.ok(adoptProposal(store, proposed, {}, true) > 0); assert.equal(store.writes, 1)
  assert.deepEqual(JSON.parse(store.getItem(key)).shifts[0], JSON.parse(before.find(([area]) => area === key)[1]).shifts[0])
  const failed = storage({ fail: true }), original = [...failed.values]
  assert.throws(() => adoptProposal(failed, draft(failed), {}, true), /quota/); assert.deepEqual([...failed.values], original)
})
