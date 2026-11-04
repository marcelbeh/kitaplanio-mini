import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { newEmployee, saveEmployee, deleteEmployee, EMPLOYEES_KEY } from '../src/modules/mitarbeiter/employees.ts'
import { STORAGE_KEY } from '../src/modules/kita/setup.ts'
const result = await build({ entryPoints: ['src/modules/abwesenheiten/absences.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { ABSENCES_KEY, newAbsence, validateAbsence, loadAbsences, saveAbsence, deleteAbsence, findOverlaps, filterAbsences, sortAbsences } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
function memory() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }
const employee = id => ({ ...newEmployee(id), name: id === 'e-1' ? 'Caro' : 'Lea', groupId: 'g-1', qualification: 'Erzieherin', weeklyMinutes: 2400, workdays: ['mon','tue','wed','thu','fri'], availability: { start: '07:00', end: '17:00' } })
function seeded() { const s = memory(); for (const id of ['e-1','e-2']) saveEmployee(s, employee(id), [{ id: 'g-1', name: 'Sonne' }], 'create'); return s }
function entry(id = 'a-1', patch = {}) { return { ...newAbsence(id), employeeId: 'e-1', employeeName: 'Caro', startDate: '2026-11-03', endDate: '2026-11-03', ...patch } }

test('CRUD mit stabilen IDs, Namenssnapshot und versionierter Wiederherstellung', () => {
  const s = seeded()
  assert.deepEqual(loadAbsences(s), { version: 1, absences: [] })
  saveAbsence(s, entry(), 'create')
  saveAbsence(s, entry('a-2', { startDate: '2026-11-05', endDate: '2026-11-05', type: 'training' }), 'create')
  saveAbsence(s, entry('a-1', { portion: 'am', type: 'sickness' }), 'update')
  const restored = loadAbsences(s)
  assert.equal(restored.version, 1)
  assert.equal(restored.absences[0].id, 'a-1')
  assert.equal(restored.absences[0].employeeName, 'Caro')
  assert.equal(restored.absences[0].portion, 'am')
  assert.equal(restored.absences[1].type, 'training')
  assert.throws(() => saveAbsence(s, entry(), 'create'), /bereits vergeben/)
  deleteAbsence(s, 'a-1')
  assert.deepEqual(loadAbsences(s).absences.map(item => item.id), ['a-2'])
  assert.throws(() => saveAbsence(s, entry(), 'update'), /entfernt/)
  assert.throws(() => deleteAbsence(s, 'a-1'), /bereits entfernt/)
})
test('Pflichtangaben, echte Kalenderdaten und halbtägige Einzeltermine', () => {
  for (const patch of [{ id: '' }, { employeeId: '' }, { type: 'unknown' }, { startDate: '' }, { startDate: '2026-02-30' }, { startDate: '2026-02-29' }, { startDate: '0000-01-01' }, { endDate: '2026-11-02' }, { portion: 'unknown' }, { portion: 'pm', endDate: '2026-11-04' }]) assert.ok(validateAbsence(entry('a-1', patch)).length, JSON.stringify(patch))
  assert.deepEqual(validateAbsence(entry('a-1', { startDate: '2028-02-29', endDate: '2028-02-29', portion: 'am' })), [])
  for (const type of ['vacation','sickness','training','timeOff','other']) assert.deepEqual(validateAbsence(entry('a-1', { type })), [])
})
test('Überschneidungen inkl. Randtagen; Vormittag und Nachmittag passen nebeneinander', () => {
  const s = seeded()
  saveAbsence(s, entry('am', { portion: 'am' }), 'create')
  saveAbsence(s, entry('pm', { portion: 'pm' }), 'create')
  assert.equal(findOverlaps(entry(), loadAbsences(s).absences).length, 2)
  assert.throws(() => saveAbsence(s, entry(), 'create'), /Überschneidung/)
  assert.deepEqual(findOverlaps(entry('am', { portion: 'am' }), loadAbsences(s).absences), [], 'eigenen Eintrag bei Bearbeitung ausschließen')
  saveAbsence(s, entry('other-person', { employeeId: 'e-2' }), 'create')
  assert.equal(findOverlaps(entry('multi', { startDate: '2026-11-01', endDate: '2026-11-03' }), loadAbsences(s).absences).length, 2)
  assert.equal(findOverlaps(entry('next', { startDate: '2026-11-04', endDate: '2026-11-04' }), loadAbsences(s).absences).length, 0)
  const before = s.getItem(ABSENCES_KEY)
  assert.throws(() => saveAbsence(s, entry('am', { portion: 'full' }), 'update'), /Überschneidung/)
  assert.equal(s.getItem(ABSENCES_KEY), before)
})
test('Chronologische Sortierung und Zeitraumfilter überschneiden inklusive Datumsgrenzen', () => {
  const entries = [entry('late', { startDate: '2026-11-10', endDate: '2026-11-15' }), entry('early', { startDate: '2026-10-30', endDate: '2026-11-04' }), entry('other', { employeeId: 'e-2' })]
  assert.deepEqual(sortAbsences(entries).map(item => item.id), ['early','other','late'])
  assert.equal(entries[0].id, 'late', 'nicht in-place sortieren')
  assert.deepEqual(filterAbsences(entries, { employeeId: 'e-1', from: '2026-11-04', to: '2026-11-10' }).map(item => item.id), ['early','late'])
  assert.deepEqual(filterAbsences(entries, { employeeId: 'e-2', from: '', to: '' }).map(item => item.id), ['other'])
})
test('Stamm-/Interviewdaten bleiben bytegenau erhalten; entfernte Mitarbeiter verlieren keine Historie', () => {
  const s = seeded()
  s.setItem(STORAGE_KEY, 'unveränderte Kita-Daten')
  s.setItem('kitaplanio-lite:interview:v1', 'unveränderter Zwischenstand')
  const before = [...s.data]
  assert.throws(() => saveAbsence(s, entry('missing', { employeeId: 'unknown' }), 'create'), /vorhandenen Mitarbeiter/)
  saveAbsence(s, entry(), 'create')
  saveAbsence(s, entry('a-1', { portion: 'am' }), 'update')
  for (const [key, value] of before) assert.equal(s.getItem(key), value)
  deleteEmployee(s, 'e-1')
  assert.equal(loadAbsences(s).absences[0].employeeName, 'Caro')
  saveAbsence(s, entry('a-1', { type: 'other', portion: 'am' }), 'update')
  assert.equal(loadAbsences(s).absences[0].employeeId, 'e-1')
  const teamAfterDelete = s.getItem(EMPLOYEES_KEY)
  deleteAbsence(s, 'a-1')
  assert.equal(s.getItem(EMPLOYEES_KEY), teamAfterDelete)
  assert.equal(s.getItem(STORAGE_KEY), before.find(([key]) => key === STORAGE_KEY)[1])
})
test('Unbekannte Version, beschädigte Daten und Schreibfehler überschreiben nichts', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, absences: [] }), JSON.stringify({ version: 1, absences: [{}] }), JSON.stringify({ version: 1, absences: [entry(), entry()] })]) {
    const s = seeded(); s.setItem(ABSENCES_KEY, raw)
    assert.throws(() => loadAbsences(s))
    assert.throws(() => saveAbsence(s, entry(), 'create'))
    assert.throws(() => deleteAbsence(s, 'a-1'))
    assert.equal(s.getItem(ABSENCES_KEY), raw)
  }
  const s = seeded(); saveAbsence(s, entry(), 'create'); const before = s.getItem(ABSENCES_KEY)
  const full = { getItem: s.getItem, setItem() { throw Error('QuotaExceededError') } }
  assert.throws(() => saveAbsence(full, entry('a-1', { portion: 'am' }), 'update'), /QuotaExceeded/)
  assert.throws(() => deleteAbsence(full, 'a-1'), /QuotaExceeded/)
  assert.equal(s.getItem(ABSENCES_KEY), before)
})

test('Gerenderte Übersicht und Mitarbeiterkarten zeigen gespeicherte Abwesenheiten ohne sofortiges Löschen', async () => {
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const require = createRequire(import.meta.url)
  async function component(path) {
    const result = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'existing-react', setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
    } }] })
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  }
  const { AbsencesPage } = await component('src/modules/abwesenheiten/AbsencesPage.tsx')
  const { EmployeesPage } = await component('src/modules/mitarbeiter/EmployeesPage.tsx')
  const s = seeded(); saveAbsence(s, entry(), 'create')
  const before = [...s.data], oldWindow = globalThis.window
  globalThis.window = { localStorage: s }
  try {
    const list = renderToStaticMarkup(createElement(AbsencesPage))
    assert.match(list, /Abwesenheit eintragen/)
    assert.match(list, /Mitarbeiter filtern/)
    assert.match(list, /Zeitraum ab/)
    assert.match(list, /Caro/)
    assert.match(list, /03.11.2026/)
    assert.doesNotMatch(list, /Endgültig löschen/)
    const card = renderToStaticMarkup(createElement(EmployeesPage))
    assert.match(card, /Abwesenheiten \(1\)/)
    assert.match(card, /Urlaub/)
    assert.match(card, /03.11.2026/)
    assert.match(card, /href="#abwesenheiten"/)
    assert.deepEqual([...s.data], before, 'Anzeige ändert keine Daten')
  } finally { globalThis.window = oldWindow }
})

test('Veraltete Abwesenheitsbearbeitung und Löschbestätigung überschreiben keine neueren Einträge', () => {
  const store=seeded();saveAbsence(store,entry(),'create')
  const original=loadAbsences(store).absences[0]
  saveAbsence(store,{...original,type:'sickness'},'update')
  const before=store.getItem(ABSENCES_KEY)
  assert.throws(()=>saveAbsence(store,{...original,portion:'am'},'update',original),/inzwischen geändert/)
  assert.equal(store.getItem(ABSENCES_KEY),before)
  assert.throws(()=>deleteAbsence(store,original.id,original),/inzwischen geändert/)
  assert.equal(store.getItem(ABSENCES_KEY),before)
  const current=loadAbsences(store).absences[0]
  assert.equal(deleteAbsence(store,current.id,current).absences.length,0)
})
