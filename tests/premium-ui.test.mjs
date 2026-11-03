import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { newSetup, saveSetup } from '../src/modules/kita/setup.ts'
import { newEmployee, saveEmployee } from '../src/modules/mitarbeiter/employees.ts'
const require = createRequire(import.meta.url)
async function loadComponent(file) {
  const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
    plugins: [{ name: 'existing-react', setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
    } }],
  })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values } }
const { DashboardPage } = await loadComponent('src/modules/dashboard/DashboardPage.tsx')
const { App } = await loadComponent('src/app/App.tsx')

test('Dashboard zeigt vorhandene Daten und schreibt keine lokalen Einstellungen', () => {
  const localStorage = storage()
  const setup = { ...newSetup(), completed: true, opening: { start: '07:00', end: '17:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '16:00', end: '17:00', minimum: 1 }, groups: [{ id: 'group-1', name: 'Sonne', periods: [{ start: '08:00', end: '16:00', minimum: 1 }] }] }
  saveSetup(localStorage, setup, null)
  saveEmployee(localStorage, { ...newEmployee('e-1'), name: 'Caro', groupId: 'group-1', qualification: 'Erzieherin', weeklyMinutes: 1200, workdays: ['mon', 'tue', 'wed', 'thu', 'fri'], availability: { start: '08:00', end: '17:00' } }, setup.groups, 'create')
  const before = [...localStorage.values]
  const previous = globalThis.window
  globalThis.window = { localStorage }
  try {
    const html = renderToStaticMarkup(createElement(DashboardPage))
    assert.match(html, /<strong>1<\/strong><span>Mitarbeiter/)
    assert.match(html, /<strong>1<\/strong><span>Gruppen/)
    assert.match(html, /Eingerichtet/)
    assert.match(html, /Vorschau/)
    assert.match(html, /Besetzung und Konflikte werden noch nicht berechnet/)
    assert.doesNotMatch(html, /100\s*%|Gut besetzt|Keine Konflikte/)
    assert.deepEqual([...localStorage.values], before)
  } finally { globalThis.window = previous }
})

test('Dashboard unterscheidet leere Daten und Speicherfehler', () => {
  const previous = globalThis.window
  try {
    globalThis.window = { localStorage: storage() }
    let html = renderToStaticMarkup(createElement(DashboardPage))
    assert.match(html, /<strong>0<\/strong><span>Mitarbeiter/)
    assert.match(html, /Noch offen/)
    globalThis.window = { localStorage: { getItem() { throw Error('SecurityError') } } }
    html = renderToStaticMarkup(createElement(DashboardPage))
    assert.match(html, /Daten nicht verfügbar/)
    assert.match(html, /role="alert"/)
    assert.doesNotMatch(html, /<strong>0<\/strong>/)
  } finally { globalThis.window = previous }
})

test('Alle vorhandenen Bereiche und mobile Hauptnavigation bleiben erreichbar', () => {
  const previous = globalThis.window
  try {
    globalThis.window = { localStorage: storage(), location: { hash: '#dashboard' } }
    const html = renderToStaticMarkup(createElement(App))
    for (const id of ['dashboard', 'kita', 'mitarbeiter', 'abwesenheiten', 'dienstplan', 'einstellungen']) assert.ok(html.includes(`href="#${id}"`), id)
    assert.match(html, /Mobile Hauptnavigation/)
    for (const label of ['Start', 'Plan', 'Team', 'Mehr']) assert.ok(html.includes(`<span>${label}</span>`))
    assert.match(html, /aria-expanded="false"/)
    assert.match(html, /KitaPlanio Lite/)
    assert.doesNotMatch(html, /KitaPlanio Mini/)
  } finally { globalThis.window = previous }
})
