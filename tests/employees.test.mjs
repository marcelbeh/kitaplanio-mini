import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteEmployee, EMPLOYEES_KEY, formatHours, hoursToMinutes, loadEmployees, newEmployee, saveEmployee, validateEmployee } from '../src/modules/mitarbeiter/employees.ts'
import { STORAGE_KEY, loadSetup, newSetup, saveSetup } from '../src/modules/kita/setup.ts'

const groups = [{ id: 'group-1', name: 'Sonne' }, { id: 'group-2', name: 'Mond' }]
function memory() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
function valid(id = 'employee-1') {
  return { ...newEmployee(id), name: ' Caro ', groupId: 'group-1', qualification: ' Erzieherin ', weeklyMinutes: 2400,
    workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], availability: { start: '07:00', end: '17:00' },
    fixedTimes: { mon: { start: '08:00', end: '16:30' } },
    rules: [{ id: 'rule-1', description: ' Freitags gern früh fertig ', type: 'wish', weekday: 'fri' }, { id: 'rule-2', description: 'Keine wechselnden Gruppen', type: 'must', weekday: null }],
  }
}

test('Minutengenaue Vertragsstunden, Dezimaltrennzeichen und Wiederbearbeitung', () => {
  assert.equal(hoursToMinutes('38,5'), 2310)
  assert.equal(hoursToMinutes('38.5'), 2310)
  assert.equal(formatHours(2310), '38,5')
  for (const minutes of [1, 23, 59, 2310, 2400]) assert.equal(hoursToMinutes(String(minutes / 60)), minutes)
  for (const value of ['', 'abc', 'Infinity', '1.001', '1e3']) assert.ok(Number.isNaN(hoursToMinutes(value)))
})
test('CRUD, stabile IDs und versioniertes Wiederherstellen', () => {
  const storage = memory()
  assert.deepEqual(loadEmployees(storage), { version: 1, employees: [] })
  saveEmployee(storage, valid(), groups, 'create')
  saveEmployee(storage, { ...valid('employee-2'), name: 'Lea' }, groups, 'create')
  let restored = loadEmployees(storage)
  assert.equal(restored.version, 1)
  assert.equal(restored.employees[0].name, 'Caro')
  assert.equal(restored.employees[0].qualification, 'Erzieherin')
  assert.equal(restored.employees[0].rules[0].description, 'Freitags gern früh fertig')
  assert.equal(restored.employees[0].fixedTimes.mon.end, '16:30')
  saveEmployee(storage, { ...restored.employees[0], name: 'Carolin', weeklyMinutes: 2310, groupId: 'group-2' }, groups, 'update')
  restored = loadEmployees(storage)
  assert.equal(restored.employees[0].id, 'employee-1')
  assert.equal(restored.employees[0].weeklyMinutes, 2310)
  assert.equal(restored.employees[1].name, 'Lea')
  deleteEmployee(storage, 'employee-1')
  assert.deepEqual(loadEmployees(storage).employees.map(e => e.id), ['employee-2'])
  assert.throws(() => saveEmployee(storage, valid('employee-2'), groups, 'create'), /bereits vergeben/)
  assert.throws(() => saveEmployee(storage, valid(), groups, 'update'), /entfernt/)
  assert.throws(() => deleteEmployee(storage, 'employee-1'), /bereits entfernt/)
})
test('Pflichtfelder, Tage und Vertragsstunden werden geprüft', () => {
  for (const patch of [{ name: ' ' }, { qualification: '' }, { groupId: '' }, { workdays: [] }, { workdays: ['sat'] }, { workdays: ['mon', 'mon'] }, { weeklyMinutes: 0 }, { weeklyMinutes: -1 }, { weeklyMinutes: 12.5 }, { weeklyMinutes: Infinity }, { weeklyMinutes: NaN }]) {
    const employee = { ...valid(), ...patch }
    assert.ok(validateEmployee(employee, groups).length, JSON.stringify(patch))
    assert.throws(() => saveEmployee(memory(), employee, groups, 'create'))
  }
})
test('Gruppenreferenzen: unbekannte Gruppe abweisen, Umbenennung ohne Mitarbeiteränderung', () => {
  const storage = memory()
  assert.throws(() => saveEmployee(storage, valid(), [], 'create'), /Stammgruppe/)
  assert.throws(() => saveEmployee(storage, { ...valid(), groupId: 'missing' }, groups, 'create'), /Stammgruppe/)
  saveEmployee(storage, valid(), groups, 'create')
  const before = storage.getItem(EMPLOYEES_KEY)
  const renamed = [{ id: 'group-1', name: 'Sterne' }]
  assert.deepEqual(validateEmployee(loadEmployees(storage).employees[0], renamed), [])
  assert.equal(storage.getItem(EMPLOYEES_KEY), before)
  assert.ok(validateEmployee(loadEmployees(storage).employees[0], []).length)
  assert.equal(loadEmployees(storage).employees.length, 1, 'fehlende Gruppe löscht keine Mitarbeiter')
})
test('Arbeitsrahmen, feste Zeiten und grobe Wochenkapazität', () => {
  const cases = [
    { availability: { start: '', end: '' } }, { availability: { start: '17:00', end: '07:00' } },
    { availability: { start: '08:00', end: '08:00' } }, { availability: { start: '25:00', end: '26:00' } },
    { fixedTimes: { mon: { start: '06:00', end: '15:00' } } }, { fixedTimes: { mon: { start: '09:00', end: '18:00' } } },
    { fixedTimes: { mon: { start: '09:00', end: '09:00' } } }, { fixedTimes: { sat: { start: '08:00', end: '09:00' } } },
    { fixedTimes: { mon: { start: '08:00', end: '09:00' } }, workdays: ['tue'], weeklyMinutes: 60 },
    { workdays: ['mon'], weeklyMinutes: 2400 },
  ]
  for (const patch of cases) assert.ok(validateEmployee({ ...valid(), ...patch }, groups).length, JSON.stringify(patch))
  const allFixed = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map(day => [day, { start: '08:00', end: '16:30' }]))
  assert.deepEqual(validateEmployee({ ...valid(), fixedTimes: allFixed }, groups), [], 'Bruttozeiten inkl. späterer Pausen nicht als Nettozeit behandeln')
  assert.ok(validateEmployee({ ...valid(), fixedTimes: { mon: { start: '08:00', end: '09:00' } }, workdays: ['mon'], weeklyMinutes: 120 }, groups).length)
})
test('Regeln: Muss/Wunsch unverändert speichern, nur Struktur validieren', () => {
  const storage = memory()
  const employee = valid()
  employee.rules[0].description = 'Montags frei obwohl Montag regulär ist'
  employee.rules[0].weekday = 'mon'
  assert.deepEqual(validateEmployee(employee, groups), [], 'keine Interpretation freier Texte')
  saveEmployee(storage, employee, groups, 'create')
  assert.equal(loadEmployees(storage).employees[0].rules[0].type, 'wish')
  assert.equal(loadEmployees(storage).employees[0].rules[1].type, 'must')
  for (const patch of [{ description: ' ' }, { type: 'unknown' }, { weekday: 'sat' }, { id: '' }]) {
    assert.ok(validateEmployee({ ...employee, rules: [{ ...employee.rules[0], ...patch }] }, groups).length)
  }
  assert.ok(validateEmployee({ ...employee, rules: [employee.rules[0], employee.rules[0]] }, groups).length)
})
test('P2-Daten bleiben bei Anlegen, Bearbeiten und Löschen bytegenau erhalten', () => {
  const storage = memory()
  const draft = saveSetup(storage, newSetup(), null)
  const before = storage.getItem(STORAGE_KEY)
  saveEmployee(storage, valid(), groups, 'create')
  saveEmployee(storage, { ...valid(), name: 'Carolin' }, groups, 'update')
  deleteEmployee(storage, 'employee-1')
  assert.equal(storage.getItem(STORAGE_KEY), before)
  assert.deepEqual(loadSetup(storage), draft)
})
test('Beschädigte Daten und unbekannte Versionen nicht überschreiben', () => {
  for (const raw of ['{', JSON.stringify({ version: 2, employees: [] }), JSON.stringify({ version: 1, employees: [{}] }), JSON.stringify({ version: 1, employees: [valid(), valid()] }), JSON.stringify({ version: 1, employees: [{ ...valid(), weeklyMinutes: -1 }] })]) {
    const storage = memory(); storage.setItem(EMPLOYEES_KEY, raw)
    assert.throws(() => loadEmployees(storage))
    assert.throws(() => saveEmployee(storage, valid(), groups, 'create'))
    assert.throws(() => deleteEmployee(storage, 'employee-1'))
    assert.equal(storage.getItem(EMPLOYEES_KEY), raw)
  }
})
test('Speicherfehler und ungültige Änderungen erhalten den letzten Stand', () => {
  const storage = memory()
  saveEmployee(storage, valid(), groups, 'create')
  const before = storage.getItem(EMPLOYEES_KEY)
  assert.throws(() => saveEmployee(storage, { ...valid(), name: '' }, groups, 'update'))
  assert.equal(storage.getItem(EMPLOYEES_KEY), before)
  const full = { getItem: storage.getItem, setItem() { throw Error('QuotaExceededError') } }
  assert.throws(() => saveEmployee(full, { ...valid(), name: 'Neu' }, groups, 'update'), /QuotaExceeded/)
  assert.throws(() => deleteEmployee(full, 'employee-1'), /QuotaExceeded/)
  assert.equal(storage.getItem(EMPLOYEES_KEY), before)
  assert.throws(() => loadEmployees({ getItem() { throw Error('SecurityError') } }), /SecurityError/)
})

test('Gerenderte Karten und Formular verwenden P2-Gruppen, Muss-Regeln und explizite Bestätigung', async () => {
  const { build } = await import('esbuild')
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  async function component(file) {
    const result = await build({
      entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
      plugins: [{ name: 'existing-react', setup(builder) {
        builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
      } }],
    })
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  }
  const { EmployeesPage } = await component('src/modules/mitarbeiter/EmployeesPage.tsx')
  const { EmployeeForm } = await component('src/modules/mitarbeiter/EmployeeForm.tsx')
  const storage = memory()
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: storage }
  try {
    const blocked = renderToStaticMarkup(createElement(EmployeesPage))
    assert.match(blocked, /Kita-Einrichtung abschließen/)
    assert.doesNotMatch(blocked, /<button[^>]*>Mitarbeiter anlegen/)
    const setup = { ...newSetup(), completed: true, opening: { start: '07:00', end: '17:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '16:00', end: '17:00', minimum: 1 }, groups: groups.map(group => ({ ...group, periods: [{ start: '08:00', end: '16:00', minimum: 1 }] })) }
    saveSetup(storage, setup, null)
    saveEmployee(storage, valid(), groups, 'create')
    const before = storage.getItem(EMPLOYEES_KEY)
    const html = renderToStaticMarkup(createElement(EmployeesPage))
    assert.match(html, /Caro/)
    assert.match(html, /Sonne/)
    assert.match(html, /40 Wochenstunden/)
    assert.match(html, /Verbindlich \(Muss\)/)
    assert.match(html, /Wunsch/)
    assert.match(html, /Entfernen/)
    assert.doesNotMatch(html, /Endgültig entfernen/, 'keine unmittelbare Löschbestätigung in der normalen Übersicht')
    saveSetup(storage, { ...setup, groups: setup.groups.map(g => g.id === 'group-1' ? { ...g, name: 'Sterne' } : g) }, setup)
    assert.match(renderToStaticMarkup(createElement(EmployeesPage)), /Sterne/)
    const form = renderToStaticMarkup(createElement(EmployeeForm, { initial: valid(), groups, onSave() {}, onCancel() {} }))
    assert.match(form, /Stammgruppe/)
    assert.match(form, /value="group-1"/)
    assert.match(form, /Sonne/)
    assert.match(form, /Feste Tageszeiten · verbindlich \(Muss\)/)
    assert.match(form, /Speichern bestätigen/)
    assert.match(form, /Abbrechen/)
    assert.equal(storage.getItem(EMPLOYEES_KEY), before, 'Anzeige und Formular öffnen speichern keine Änderungen')
  } finally { globalThis.window = oldWindow }
})

test('Veraltete Mitarbeiterbearbeitung und Löschbestätigung erhalten zwischenzeitliche Änderungen', () => {
  const store=memory();saveEmployee(store,valid(),groups,'create')
  const original=loadEmployees(store).employees[0]
  saveEmployee(store,{...original,name:'Zwischenzeitlich geändert'},groups,'update')
  const before=store.getItem(EMPLOYEES_KEY)
  assert.throws(()=>saveEmployee(store,{...original,qualification:'Veralteter Entwurf'},groups,'update',original),/inzwischen geändert/)
  assert.equal(store.getItem(EMPLOYEES_KEY),before)
  assert.throws(()=>deleteEmployee(store,original.id,original),/inzwischen geändert/)
  assert.equal(store.getItem(EMPLOYEES_KEY),before)
  const current=loadEmployees(store).employees[0]
  assert.equal(deleteEmployee(store,current.id,current).employees.length,0)
})
