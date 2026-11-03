import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSetup, newSetup, resizeGroups, saveSetup, STORAGE_KEY, validateSetup } from '../src/modules/kita/setup.ts'

function valid() {
  return {
    ...newSetup(),
    opening: { start: '07:00', end: '17:00' },
    early: { start: '07:00', end: '08:00', minimum: 1 },
    late: { start: '16:00', end: '17:00', minimum: 2 },
    groups: [
      { id: 'group-1', name: 'Sonne', periods: [{ start: '08:00', end: '12:00', minimum: 2 }, { start: '12:00', end: '16:00', minimum: 1 }] },
      { id: 'group-2', name: 'Mond', periods: [{ start: '08:00', end: '16:00', minimum: 3 }] },
    ],
  }
}
function memory() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('gültige gemeinsame Phasen und variable Kernbesetzung', () => {
  assert.deepEqual(validateSetup(valid()), [])
  const setup = valid()
  setup.groups[0].periods.reverse()
  assert.deepEqual(validateSetup(setup), [], 'Eingabereihenfolge ist unerheblich')
})
test('Gruppennamen: leer, Leerzeichen, Großschreibung und Unicode-Duplikate', () => {
  for (const names of [['', 'Mond'], ['   ', 'Mond'], [' Sonne ', 'sonne'], ['Äpfel', 'A\u0308pfel']]) {
    const setup = valid(); setup.groups.forEach((g, i) => { g.name = names[i] })
    assert.ok(validateSetup(setup, 0).length)
  }
})
test('Gruppenanzahl vor Abschluss und Sperre danach', () => {
  const setup = valid()
  assert.equal(resizeGroups(setup, 3).groups.length, 3)
  assert.equal(resizeGroups(setup, 1).groups[0].id, setup.groups[0].id)
  for (const count of [0, -1, 1.5, NaN, Infinity, 101]) assert.throws(() => resizeGroups(setup, count))
  assert.throws(() => resizeGroups({ ...setup, completed: true }, 3), /gesperrt/)
})
test('Öffnung: Pflichtangaben, Zeitformat, gleiche und umgekehrte Zeiten', () => {
  for (const opening of [{ start: '', end: '' }, { start: '17:00', end: '07:00' }, { start: '08:00', end: '08:00' }, { start: '24:00', end: '25:00' }]) {
    assert.ok(validateSetup({ ...valid(), opening }, 1).length)
  }
})
test('Mindestwerte: negativ, null, Dezimalzahl und nicht endliche Zahlen', () => {
  for (const minimum of [-1, 0, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const target of ['early', 'late', 'group']) {
      const setup = valid()
      if (target === 'group') setup.groups[0].periods[0].minimum = minimum
      else setup[target].minimum = minimum
      assert.ok(validateSetup(setup, 2).length, `${target}: ${minimum}`)
    }
  }
})
test('Früh-/Spätbetreuung innerhalb Öffnung und positive Kernzeit', () => {
  const mutations = [
    s => { s.early.start = '06:00' }, s => { s.late.end = '18:00' },
    s => { s.early.start = '07:30' }, s => { s.late.end = '16:30' },
    s => { s.early.end = '16:30' }, s => { s.early.end = s.late.start },
    s => { s.early.end = '06:00' }, s => { s.late.start = '17:30' },
  ]
  for (const mutate of mutations) { const setup = valid(); mutate(setup); assert.ok(validateSetup(setup, 2).length) }
})
test('Kernzeit: Lücken, Überschneidungen, fehlende und fremde Zeitbereiche', () => {
  const mutations = [
    s => { s.groups[0].periods[1].start = '11:00' },
    s => { s.groups[0].periods[1].start = '13:00' },
    s => { s.groups[0].periods[0].start = '07:00' },
    s => { s.groups[0].periods[1].end = '15:00' },
    s => { s.groups[0].periods = [] },
    s => { s.groups[0].periods[0].start = '12:00' },
  ]
  for (const mutate of mutations) { const setup = valid(); mutate(setup); assert.ok(validateSetup(setup, 2).length) }
})
test('Versionierter Entwurf wird wiederhergestellt, Abschluss nur gültig', () => {
  const storage = memory()
  assert.equal(loadSetup(storage), null)
  const draft = saveSetup(storage, newSetup(), null)
  assert.deepEqual(loadSetup(storage), draft)
  assert.equal(loadSetup(storage).version, 1)
  assert.throws(() => saveSetup(storage, { ...draft, completed: true }, draft), /Pflichtangaben/)
  assert.equal(loadSetup(storage).completed, false)
})
test('Abschluss und erlaubte Bearbeitung erhalten Status, Anzahl und IDs', () => {
  const storage = memory()
  const done = saveSetup(storage, { ...valid(), completed: true }, null)
  assert.deepEqual(loadSetup(storage), done)
  const edited = structuredClone(done)
  edited.groups[0].name = ' Sterne '
  edited.groups[0].periods[0].minimum = 4
  saveSetup(storage, edited, done)
  assert.equal(loadSetup(storage).groups[0].name, 'Sterne')
  assert.equal(loadSetup(storage).groups[0].periods[0].minimum, 4)
  assert.equal(loadSetup(storage).completed, true)
  for (const groups of [done.groups.slice(0, 1), [...done.groups, { ...done.groups[0], id: 'group-3' }], [...done.groups].reverse()]) {
    assert.throws(() => saveSetup(storage, { ...done, groups }, done), /hinzugefügt oder entfernt/)
  }
  assert.throws(() => saveSetup(storage, { ...done, completed: false }, done), /abgeschlossen/)
  assert.throws(() => saveSetup(storage, { ...done, completed: false }, null), /abgeschlossen/, 'gespeicherte Sperre gilt auch ohne UI-Zustand')
})
test('ungültige spätere Bearbeitung überschreibt fertige Einrichtung nicht', () => {
  const storage = memory()
  const done = saveSetup(storage, { ...valid(), completed: true }, null)
  const invalid = structuredClone(done); invalid.groups[0].name = ''
  assert.throws(() => saveSetup(storage, invalid, done))
  assert.deepEqual(loadSetup(storage), done)
})
test('unbekannte Version, beschädigte Daten und doppelte IDs werden nicht überschrieben', () => {
  for (const raw of ['{', JSON.stringify({ ...valid(), version: 2 }), JSON.stringify({ ...valid(), groups: [{ id: 123 }] }), JSON.stringify({ ...valid(), groups: [valid().groups[0], valid().groups[0]] })]) {
    const storage = memory(); storage.setItem(STORAGE_KEY, raw)
    assert.throws(() => loadSetup(storage))
    assert.throws(() => saveSetup(storage, valid(), null))
    assert.equal(storage.getItem(STORAGE_KEY), raw)
  }
})
test('gesperrter oder voller Browser-Speicher wird als Fehler weitergegeben', () => {
  assert.throws(() => loadSetup({ getItem() { throw Error('SecurityError') } }), /SecurityError/)
  assert.throws(() => saveSetup({ getItem: () => null, setItem() { throw Error('QuotaExceededError') } }, valid(), null), /QuotaExceededError/)
})

test('Oberfläche stellt abgeschlossene Einrichtung ohne Gruppenanzahl-Eingabe wieder her', async () => {
  const { build } = await import('esbuild')
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const result = await build({
    entryPoints: ['src/modules/kita/KitaPage.tsx'], bundle: true, write: false,
    platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'existing-react', setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
    } }],
  })
  const { KitaPage } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
  const storage = memory()
  const oldWindow = globalThis.window
  globalThis.window = { localStorage: storage }
  try {
    const initial = renderToStaticMarkup(createElement(KitaPage))
    assert.match(initial, /Anzahl der Gruppen/)
    saveSetup(storage, { ...valid(), completed: true }, null)
    const completed = renderToStaticMarkup(createElement(KitaPage))
    assert.match(completed, /Einrichtung abgeschlossen/)
    assert.match(completed, /Gruppenanzahl ist dauerhaft gesperrt/)
    assert.match(completed, /Einstellungen bearbeiten/)
    assert.match(completed, /Sonne/)
    assert.match(completed, /07:00/)
    assert.doesNotMatch(completed, /Anzahl der Gruppen/)
    assert.doesNotMatch(completed, /type="number"/)
  } finally { globalThis.window = oldWindow }
})
