import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
// Execute the actual App event handlers with isolated hooks. No DOM/layout emulation.
const result = await build({ entryPoints: ['src/app/App.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'navigation-harness', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'harness' }))
    builder.onLoad({ filter: /.*/, namespace: 'harness' }, () => ({ contents: `
      export const useState = initial => globalThis.navigationHarness.useState(initial);
      export const useRef = () => ({ current: null });
      export const useEffect = effect => globalThis.navigationHarness.effects.push(effect);
    ` }))
    builder.onResolve({ filter: /^react\// }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
  } }],
})
const { App } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
function elements(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]
}
function mount(hash) {
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldHarness = globalThis.navigationHarness
  const state = [], events = new Map(), focused = []
  const harness = { cursor: 0, effects: [], useState(initial) {
    const i = this.cursor++
    if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
    return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }]
  } }
  globalThis.navigationHarness = harness
  globalThis.window = { location: { hash }, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) }
  globalThis.document = { title: '', getElementById: id => ({ focus: () => focused.push(id) }), addEventListener() {}, removeEventListener() {} }
  return {
    state, focused,
    render() { harness.cursor = 0; harness.effects = []; const tree = App(); harness.effects.forEach(effect => effect()); return elements(tree) },
    navigate(next) { window.location.hash = next; events.get('hashchange')() },
    restore() { globalThis.window = oldWindow; globalThis.document = oldDocument; globalThis.navigationHarness = oldHarness },
  }
}
test('Inhaltsanker erhalten den aktuellen Bereich; reguläre Bereichslinks wechseln ihn', () => {
  for (const id of ['kita', 'mitarbeiter', 'dienstplan']) {
    const app = mount(`#${id}`)
    try {
      const tree = app.render()
      assert.ok(tree.some(node => node.props?.className === 'skip-link' && node.props.href === '#main-content'))
      app.navigate('#main-content')
      assert.equal(app.state[0].id, id)
      for (const target of ['dashboard', 'abwesenheiten', 'einstellungen', 'kita', 'mitarbeiter', 'dienstplan']) {
        app.navigate(`#${target}`)
        assert.equal(app.state[0].id, target)
      }
    } finally { app.restore() }
  }
})
test('Mehr-Menü gibt bei erneutem Anwählen des aktuellen Bereichs den Fokus an den Inhalt zurück', () => {
  const app = mount('#kita')
  try {
    let tree = app.render()
    tree.find(node => node.type === 'button' && 'aria-expanded' in node.props).props.onClick()
    tree = app.render()
    assert.equal(app.state[1], true)
    app.focused.length = 0
    const panel = tree.find(node => node.props?.id === 'mobile-more')
    elements(panel).find(node => node.type === 'a' && node.props.href === '#kita').props.onClick()
    assert.equal(app.state[1], false)
    assert.equal(app.state[0].id, 'kita')
    assert.deepEqual(app.focused, ['page-title'])
  } finally { app.restore() }
})

test('Monatsübersicht ist direkt über Navigation erreichbar; Ansichtswechsel aktualisiert die Route', () => {
  const app = mount('#monatsplan')
  try {
    let tree = app.render()
    assert.equal(app.state[0].id, 'monatsplan')
    assert.ok(tree.some(node => node.type === 'a' && node.props.href === '#monatsplan'))
    const schedule = tree.find(node => node.props?.initialView === 'month')
    assert.ok(schedule)
    schedule.props.onViewChange('week')
    assert.equal(window.location.hash, '#dienstplan')
    app.navigate('#dienstplan'); tree = app.render()
    assert.ok(tree.some(node => node.props?.initialView === 'week'))
    tree.find(node => node.props?.initialView === 'week').props.onViewChange('month')
    assert.equal(window.location.hash, '#monatsplan')
    app.navigate('#monatsplan'); tree = app.render()
    tree.find(node => node.type === 'button' && 'aria-expanded' in node.props).props.onClick()
    tree = app.render()
    const more = tree.find(node => node.props?.id === 'mobile-more')
    assert.ok(elements(more).some(node => node.type === 'a' && node.props.href === '#monatsplan'))
  } finally { app.restore() }
})

test('Vorlagen sind direkt in der Navigation und mobil unter Mehr mit dem richtigen Wochenbereich verlinkt', () => {
  const app = mount('#vorlagen')
  try {
    let tree = app.render()
    assert.equal(app.state[0].id, 'vorlagen')
    assert.ok(tree.some(node => node.type === 'a' && node.props.href === '#vorlagen'))
    const schedule = tree.find(node => node.props?.initialSection === 'templates')
    assert.equal(schedule.props.initialView, 'week')
    tree.find(node => node.type === 'button' && 'aria-expanded' in node.props).props.onClick()
    tree = app.render()
    const more = tree.find(node => node.props?.id === 'mobile-more')
    assert.ok(elements(more).some(node => node.type === 'a' && node.props.href === '#vorlagen'))
  } finally { app.restore() }
})

test('Auswertungen sind als eigener lesender Bereich in Navigation und mobil unter Mehr erreichbar', () => {
  const app = mount('#auswertungen')
  try {
    let tree = app.render()
    assert.equal(app.state[0].id, 'auswertungen')
    assert.ok(tree.some(node => node.type === 'a' && node.props.href === '#auswertungen'))
    assert.ok(tree.some(node => typeof node.type === 'function' && node.type.name === 'AnalyticsPage'))
    tree.find(node => node.type === 'button' && 'aria-expanded' in node.props).props.onClick()
    tree = app.render()
    const more = tree.find(node => node.props?.id === 'mobile-more')
    assert.ok(elements(more).some(node => node.type === 'a' && node.props.href === '#auswertungen'))
  } finally { app.restore() }
})

test('KI-Assistent ist über Desktop-Navigation, direkten Hash und mobiles Mehr erreichbar', () => {
  const app = mount('#ki-assistent')
  try {
    let nodes = app.render()
    assert.ok(nodes.some(node => node.type?.name === 'AssistantPage'))
    assert.ok(nodes.some(node => node.type === 'a' && node.props.href === '#ki-assistent' && node.props['aria-current'] === 'page'))
    nodes.find(node => node.type === 'button' && node.props['aria-expanded'] !== undefined).props.onClick()
    nodes = app.render()
    const panel = nodes.find(node => node.props?.id === 'mobile-more')
    assert.ok(elements(panel).some(node => node.type === 'a' && node.props.href === '#ki-assistent'))
  } finally { app.restore() }
})
