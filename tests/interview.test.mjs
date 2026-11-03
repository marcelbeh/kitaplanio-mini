import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { newSetup, saveSetup, loadSetup, STORAGE_KEY } from '../src/modules/kita/setup.ts'
import { newEmployee, saveEmployee, loadEmployees, EMPLOYEES_KEY } from '../src/modules/mitarbeiter/employees.ts'
const bundled = await build({ entryPoints: ['src/modules/kita/interview.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { startInterview, loadInterview, saveInterview, validateInterview, finishInterview, shouldStartInterview, INTERVIEW_KEY } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
function memory() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data }
}
function validSetup() {
  return { ...newSetup(), name: 'Sonnenkita', careDays: ['mon', 'tue', 'wed', 'thu', 'fri'], opening: { start: '07:00', end: '17:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '16:00', end: '17:00', minimum: 1 }, groups: [{ id: 'group-1', name: 'Sonne', periods: [{ start: '08:00', end: '16:00', minimum: 2 }] }] }
}
function validEmployee() {
  return { ...newEmployee('employee-1'), name: 'Caro', groupId: 'group-1', qualification: 'Erzieherin', weeklyMinutes: 2310, workdays: ['mon','tue','wed','thu','fri'], availability: { start: '07:00', end: '17:00' }, fixedTimes: { mon: { start: '08:00', end: '16:30' } }, rules: [{ id: 'r-1', description: 'Freitags gern früh fertig', type: 'wish', weekday: 'fri' }] }
}
test('Sechs Schritte: ausfüllen, automatisch speichern, pausieren, fortsetzen und abschließen', () => {
  const storage = memory()
  assert.equal(shouldStartInterview(storage), true)
  let draft = startInterview(storage)
  assert.equal(draft.setup.early.minimum, 0, 'kein Personalbedarf vorgeben')
  assert.deepEqual(draft.setup.careDays, [], 'neue Betreuungstage müssen beantwortet werden')
  assert.ok(validateInterview(draft, 0).length)
  draft.setup = validSetup()
  for (const step of [0, 1, 2]) {
    draft.step = step
    assert.deepEqual(validateInterview(draft, step), [])
    saveInterview(storage, draft)
    assert.equal(loadInterview(storage).step, step)
  }
  draft.step = 3
  draft.team = [{ employee: validEmployee(), hours: '38,5' }]
  draft.activeMember = 'employee-1'
  assert.deepEqual(validateInterview(draft, 3), [])
  draft.paused = true
  saveInterview(storage, draft)
  assert.equal(shouldStartInterview(storage), false)
  assert.equal(storage.getItem(STORAGE_KEY), null)
  assert.equal(storage.getItem(EMPLOYEES_KEY), null, 'Zwischenstände sind keine gültigen Stammdaten')
  draft = loadInterview(storage)
  draft.paused = false; draft.step = 4; draft.setup.pauseNotes = 'Pausen bitte im Team abstimmen.'
  assert.deepEqual(validateInterview(draft, 4), [])
  draft.step = 5
  assert.deepEqual(validateInterview(draft), [])
  saveInterview(storage, draft)
  finishInterview(storage, draft)
  assert.equal(loadSetup(storage).completed, true)
  assert.equal(loadSetup(storage).pauseNotes, draft.setup.pauseNotes)
  assert.equal(loadEmployees(storage).employees[0].weeklyMinutes, 2310)
  assert.equal(loadInterview(storage).status, 'completed')
  assert.equal(shouldStartInterview(storage), false, 'kein automatischer Neustart nach Abschluss')
  assert.throws(() => saveInterview(storage, draft), /abgeschlossen/, 'alte Autosave-Ereignisse öffnen kein abgeschlossenes Interview erneut')
})
test('Unvollständige Antworten und Roh-Stundenangaben bleiben nach Neuladen erhalten', () => {
  const storage = memory(), draft = startInterview(storage)
  draft.groupCount = ''; draft.setup.name = 'Unfertig'; draft.step = 3
  draft.team = [{ employee: newEmployee('e-1'), hours: '38,' }]
  saveInterview(storage, draft)
  assert.deepEqual(loadInterview(storage), draft)
  assert.ok(validateInterview(draft).length)
  assert.throws(() => finishInterview(storage, draft))
  assert.equal(storage.getItem(STORAGE_KEY), null)
})
test('Vorhandene Stammdaten vorausfüllen, Zwischenstand und unveränderten Abschluss bytegenau erhalten', () => {
  const storage = memory()
  const setup = { ...validSetup(), completed: true }
  delete setup.name; delete setup.careDays
  saveSetup(storage, setup, null)
  saveEmployee(storage, validEmployee(), setup.groups, 'create')
  const beforeKita = storage.getItem(STORAGE_KEY), beforeTeam = storage.getItem(EMPLOYEES_KEY)
  const draft = startInterview(storage)
  assert.deepEqual(draft.setup, loadSetup(storage))
  assert.deepEqual(draft.team[0].employee, loadEmployees(storage).employees[0])
  draft.step = 4; draft.paused = true; saveInterview(storage, draft)
  assert.equal(storage.getItem(STORAGE_KEY), beforeKita)
  assert.equal(storage.getItem(EMPLOYEES_KEY), beforeTeam)
  finishInterview(storage, loadInterview(storage))
  assert.equal(storage.getItem(STORAGE_KEY), beforeKita)
  assert.equal(storage.getItem(EMPLOYEES_KEY), beforeTeam)
})
test('Stammdatenänderung während Interview wird nicht überschrieben; Gruppensperre bleibt erhalten', () => {
  const storage = memory()
  saveSetup(storage, { ...validSetup(), completed: true }, null)
  saveEmployee(storage, validEmployee(), validSetup().groups, 'create')
  const draft = startInterview(storage)
  saveEmployee(storage, { ...validEmployee(), name: 'Carolin' }, validSetup().groups, 'update')
  const before = [...storage.data]
  assert.throws(() => finishInterview(storage, draft), /seit Interviewbeginn/)
  assert.deepEqual([...storage.data], before)
  const latest = startInterview(storage)
  latest.setup.groups.push({ ...latest.setup.groups[0], id: 'group-2', name: 'Mond' }); latest.groupCount = '2'
  assert.throws(() => finishInterview(storage, latest), /Gruppen/)
  assert.deepEqual([...storage.data], before)
})
test('Fehlgeschlagene Abschlussübernahme rollt vorherige Schreibvorgänge zurück', () => {
  const storage = memory(), draft = startInterview(storage)
  draft.setup = validSetup(); draft.team = [{ employee: validEmployee(), hours: '38,5' }]
  saveInterview(storage, draft)
  const before = [...storage.data]
  let failOnce = true
  const failing = { ...storage, setItem(key, value) { if (key === INTERVIEW_KEY && failOnce) { failOnce = false; throw Error('QuotaExceededError') } storage.setItem(key, value) } }
  assert.throws(() => finishInterview(failing, draft), /QuotaExceeded/)
  assert.deepEqual([...storage.data], before)
})
test('Unbekannte oder beschädigte Interviewdaten werden nicht überschrieben', () => {
  const storage = memory(), draft = startInterview(storage)
  storage.setItem(INTERVIEW_KEY, JSON.stringify({ version: 2, status: 'draft' }))
  const before = [...storage.data]
  assert.throws(() => saveInterview(storage, draft))
  assert.deepEqual([...storage.data], before)
})

test('Wiederverwendetes Mitarbeiterformular trennt Team/Regeln ohne verschachtelte Formulare', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const require = createRequire(import.meta.url)
  const result = await build({ entryPoints: ['src/modules/mitarbeiter/EmployeeForm.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'existing-react', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
  } }] })
  const { EmployeeForm } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  const props = { initial: validEmployee(), groups: validSetup().groups, embedded: true, hoursInput: '38,5' }
  const team = renderToStaticMarkup(createElement(EmployeeForm, { ...props, part: 'team' }))
  const rules = renderToStaticMarkup(createElement(EmployeeForm, { ...props, part: 'rules' }))
  assert.match(team, /Vertragliche Wochenstunden/)
  assert.doesNotMatch(team, /Möglicher Arbeitsrahmen/)
  assert.match(rules, /Möglicher Arbeitsrahmen/)
  assert.match(rules, /Feste Tageszeiten/)
  assert.doesNotMatch(rules, /Vertragliche Wochenstunden/)
  assert.doesNotMatch(team + rules, /<form/)
})
