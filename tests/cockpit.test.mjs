import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const output = await build({ stdin: { contents: `export * from './src/modules/dienstplan/cockpit.ts'; export { WeekCockpit } from './src/modules/dienstplan/WeekCockpit.tsx'; export { SchedulePage } from './src/modules/dienstplan/SchedulePage.tsx'; export { PlanChecks } from './src/modules/dienstplan/PlanChecks.tsx';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'cockpit-hooks', setup(b) {
  b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'test' }))
  b.onLoad({ filter: /hooks/, namespace: 'test' }, () => ({ contents: 'export const useState = initial => globalThis.cockpitHarness.state(initial); export const useEffect = () => {}; export const useRef = initial => ({current:initial});' }))
  b.onResolve({ filter: /^react\// }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
} }] })
const { issueShift, shiftAnchor, planningTask, cockpitTasks, WeekCockpit, SchedulePage, PlanChecks } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
const date = '2027-01-04', weekend = '2027-01-09'
const shift = { id: 'shift:with:colon', employeeId: 'p:1', groupId: 'g', date, start: '07:00', end: '10:00' }
const issue = (id, kind = 'hint', day = date) => ({ id, kind, date: day, person: 'Testperson', cause: 'Testbefund', correction: 'Daten manuell prüfen.' })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]

test('Exakte Dienstzuordnung ohne Namensraten; mehrdeutige, überlappende und gruppenbezogene Befunde öffnen nur den Tag', () => {
  assert.equal(issueShift(issue(`pause:${shift.id}`), [shift]), shift)
  assert.equal(issueShift(issue(`missing-pause:${shift.employeeId}:${date}`), [shift]), shift)
  const second = { ...shift, id: 'second', start: '11:00', end: '12:00' }
  assert.equal(issueShift(issue(`missing-pause:${shift.employeeId}:${date}`), [shift, second]), null)
  for (const id of ['staff:2027-01-04:group:g:480', `overlap:${shift.id}:${second.id}`, 'hours:p:1', 'unknown']) assert.equal(issueShift(issue(id, 'conflict'), [shift, second]), null)
  assert.equal(issueShift(issue(`pause:${shift.id}`, 'hint', weekend), [shift]), null)
  assert.notEqual(shiftAnchor(shift.id, true), shiftAnchor(shift.id, false))
})

test('Kompakte Aufgaben erhalten Pause und Unterbesetzung; keine Umdeutung von Pausenlage in ein erfundenes Eingabefeld', () => {
  const items = [...Array.from({ length: 10 }, (_, i) => issue(`staff:${i}`, 'conflict')), issue('missing-pause:p:1'), issue('pause:s')]
  const before = JSON.stringify(items), tasks = cockpitTasks(items)
  assert.equal(tasks.length, 5); assert.ok(tasks.some(item => item.id.startsWith('staff:'))); assert.ok(tasks.some(item => item.id.startsWith('missing-pause:'))); assert.ok(tasks.some(item => item.id.startsWith('pause:')))
  assert.match(planningTask(issue('missing-pause:p')), /Pausendauer/)
  assert.match(planningTask(issue('pause:s')), /im Team abstimmen/)
  assert.match(planningTask(issue('staff:x', 'conflict')), /Besetzung/)
  assert.equal(JSON.stringify(items), before)
})

test('Cockpit übernimmt Tagesstatus unverändert, zählt Personen einmal und navigiert auch zum Wochenend-Sonderdienst', () => {
  const actions = [], props = { days: [date, weekend], selected: date, shifts: [shift, { ...shift, id: 's2' }, { ...shift, id: 's3', date: weekend }], absences: [], occurrences: [{ eventId: 'event', date: weekend, start: '18:00', end: '19:00' }], issues: [issue('staff:x', 'conflict'), issue('missing-pause:p:1')], staffing: day => ({ status: day === weekend ? 'unspecified' : 'check', windows: [], note: '' }), preview: false, unavailable: false, onDay: day => actions.push(day), onIssue: item => actions.push(item.id), onChecks: () => actions.push('checks'), onPublication: () => actions.push('publication'), onPrint: () => actions.push('print') }
  const tree = nodes(WeekCockpit(props)), days = tree.filter(node => node.props?.className === 'cockpit-day')
  assert.equal(days.length, 2); assert.equal(days[0].props.children.find(node => Array.isArray(node?.props?.children) && node.props.children.includes(' Mitarbeitende geplant · ')).props.children[0], 1)
  assert.ok(nodes(days[1]).some(node => String(node.props?.children).includes('Bedarf nicht festgelegt')))
  days[1].props.onClick(); assert.equal(actions[0], weekend)
  tree.find(node => node.type === 'button' && node.props.children === 'Zur Freigabe').props.onClick()
  tree.find(node => node.type === 'button' && node.props.children === 'Zu PDF / Druck').props.onClick()
  tree.find(node => node.type === 'button' && node.props.children === 'Zur vollständigen Planprüfung').props.onClick()
  assert.deepEqual(actions.slice(1), ['publication', 'print', 'checks'])
  const firstTask = tree.find(node => node.type === 'button' && nodes(node).some(item => item.props?.className === 'schedule-edit-hint')); firstTask.props.onClick(); assert.equal(actions.at(-1), 'staff:x')
  const preview = nodes(WeekCockpit({ ...props, preview: true }))
  assert.ok(preview.filter(node => node.type === 'button' && ['Zur Freigabe', 'Zu PDF / Druck'].includes(node.props.children)).every(node => node.props.disabled))
})

test('Leere und unvollständige Wochen werden nicht als fachlich abschließend freigegeben dargestellt', () => {
  const base = { days: [], selected: date, shifts: [], absences: [], occurrences: [], issues: [], staffing: () => assert.fail(), preview: false, onDay() {}, onIssue() {}, onChecks() {}, onPublication() {}, onPrint() {} }
  assert.ok(nodes(WeekCockpit({ ...base, unavailable: false })).some(node => String(node.props?.children).includes('Das bestätigt keine nicht konfigurierten Vorgaben')))
  assert.ok(nodes(WeekCockpit({ ...base, unavailable: true })).some(node => node.props?.role === 'alert'))
})

function mountPage() {
  const prior = { window: globalThis.window, document: globalThis.document, harness: globalThis.cockpitHarness }
  const values = new Map([
    ['kitaplanio-lite:kita:v1', JSON.stringify({ version: 1, completed: true, careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g', name: 'Nest', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] })],
    ['kitaplanio-lite:employees:v1', JSON.stringify({ version: 1, employees: [{ id: shift.employeeId, name: 'Testperson', qualification: 'Test', groupId: 'g', weeklyMinutes: 600, workdays: ['mon'], availability: { start: '07:00', end: '18:00' }, fixedTimes: {}, rules: [] }] })],
    ['kitaplanio-lite:shifts:v1', JSON.stringify({ version: 1, shifts: [shift] })],
  ])
  const slots = [], focused = [], details = { open: false }; let index = 0, mobile = false, writes = 0
  globalThis.cockpitHarness = { state(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] } }
  globalThis.window = { localStorage: { getItem: key => values.get(key) ?? null, setItem() { writes++; assert.fail('Navigation must not write') } }, requestAnimationFrame: fn => fn(), matchMedia: () => ({ matches: mobile }) }
  globalThis.document = { getElementById: id => id === 'schedule-checks-details' ? details : ({ focus: () => focused.push(id), scrollIntoView() {}, hasAttribute: () => false }) }
  return { slots, focused, details, get writes() { return writes }, mobile(value) { mobile = value }, render() { index = 0; return nodes(SchedulePage()) }, restore() { globalThis.window = prior.window; globalThis.document = prior.document; globalThis.cockpitHarness = prior.harness } }
}

test('Vorhandene Wochenansicht verdrahtet Cockpit, direkte Dienstnavigation, Filterauflösung und Freigabe-/Druck-Sprünge ohne Schreibzugriff', () => {
  const page = mountPage()
  try {
    let tree = page.render(), cockpit = tree.find(node => node.type?.name === 'WeekCockpit')
    assert.ok(cockpit)
    for (const mobile of [false, true]) {
      page.mobile(mobile); page.slots[4] = 'other-group'
      cockpit.props.onIssue(issue(`pause:${shift.id}`))
      assert.equal(page.slots[4], ''); assert.equal(page.slots[3], date)
      assert.equal(page.focused.at(-1), shiftAnchor(shift.id, mobile))
      assert.ok(page.render().some(node => node.type === 'button' && node.props.id === shiftAnchor(shift.id, mobile)))
    }
    cockpit.props.onPublication(); assert.equal(page.focused.at(-1), 'schedule-publication')
    cockpit.props.onPrint(); assert.equal(page.focused.at(-1), 'schedule-print-source')
    cockpit.props.onChecks(); assert.equal(page.details.open, true); assert.equal(page.focused.at(-1), 'schedule-checks')
    page.slots[10] = { version: 1 }; tree = page.render(); assert.ok(!tree.some(node => node.type?.name === 'WeekCockpit'))
    assert.equal(page.writes, 0)
  } finally { page.restore() }
})

test('Bestehende Konfliktliste verwendet dieselbe Sprungaktion; alte Tag-Callback-Schnittstelle bleibt nutzbar', () => {
  const page = mountPage(), actions = [], item = issue(`pause:${shift.id}`)
  try {
    const props = { issues: [item], options: {}, onOptions() {}, onSelect: date => actions.push(date) }
    let tree = nodes(PlanChecks({ ...props, onIssue: value => actions.push(value.id) }))
    tree.find(node => node.props?.className === 'schedule-edit').props.onClick(); assert.equal(actions.at(-1), item.id)
    tree = nodes(PlanChecks(props)); tree.find(node => node.props?.className === 'schedule-edit').props.onClick(); assert.equal(actions.at(-1), date)
  } finally { page.restore() }
})

test('Gesperrter oder nicht mehr gerenderter Konfliktdienst behält das sichere Tagesziel und öffnet keinen Editor', () => {
  const page = mountPage(), get = globalThis.document.getElementById
  try {
    for (const mobile of [false, true]) {
      page.mobile(mobile)
      const tree = page.render(), cockpit = tree.find(node => node.type?.name === 'WeekCockpit')
      for (const missing of [false, true]) {
        globalThis.document.getElementById = id => id === shiftAnchor(shift.id, mobile) ? missing ? null : { hasAttribute: () => true, focus() { assert.fail('Gesperrter Dienst darf keinen Fokus erhalten') } } : get(id)
        cockpit.props.onIssue(issue(`pause:${shift.id}`))
        assert.equal(page.focused.at(-1), mobile ? 'schedule-day-heading' : `schedule-date-${date}`)
        assert.equal(page.slots[6], null)
      }
    }
    assert.equal(page.writes, 0)
  } finally { page.restore() }
})
