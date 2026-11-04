import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ stdin: { contents: `export * from './src/modules/ki-assistent/assistant.ts'; export * from './supabase/functions/_shared/assistant-protocol.ts'; export * from './supabase/functions/caro-assistant/handler.ts'; export * from './supabase/functions/caro-assistant/authorize.ts'; export { createAppStorage } from './src/cloud/workspace.ts'; export { AREAS } from './src/cloud/dataset.ts'; export { teamPlan } from './src/modules/dienstplan/publications.ts';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' })
const { prepareAiSession, aiPreview, adoptAi, parseRequest, parseAnswer, createAssistantHandler, authorizeMember, teamPlan, localAnswerText, MAX_INPUT_BYTES, answerSchemaFor, aiTimeSummary, createAppStorage, AREAS } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const date = '2027-01-04', shiftsKey = 'kitaplanio-lite:shifts:v1', publicationKey = 'caro:published-weeks:v1'
const setup = { version: 1, completed: true, name: 'Geheime Kita', careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'private-group', name: 'Geheime Gruppe', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }], pauseNotes: 'Private Notiz' }
const employee = { id: 'private-person', name: 'Private Person', groupId: 'private-group', qualification: 'private@example.org', weeklyMinutes: 600, workdays: ['mon'], availability: { start: '07:00', end: '18:00' }, fixedTimes: {}, rules: [], preferences: { preferredDaysOff: ['fri'], preferredHours: { start: '08:00', end: '15:00' } } }
function seeded(patch = {}) {
  const values = new Map([
    ['kitaplanio-lite:kita:v1', JSON.stringify(patch.setup ?? setup)],
    ['kitaplanio-lite:employees:v1', JSON.stringify({ version: 1, employees: patch.employees ?? [employee] })],
    [shiftsKey, JSON.stringify({ version: 1, shifts: patch.shifts ?? [] })],
    ['kitaplanio-lite:absences:v1', JSON.stringify({ version: 1, absences: patch.absences ?? [] })],
    ['kitaplanio-lite:events:v1', JSON.stringify({ version: 1, events: patch.events ?? [] })],
  ])
  let writes = 0
  return { values, get writes() { return writes }, getItem: key => values.get(key) ?? null, setItem(key, value) { if (patch.fail) throw Error('quota'); values.set(key, value); writes++ } }
}
const answer = (shifts = [{ person: 'P1', group: 'G1', date, start: '07:00', end: '10:00', reason: 'P1 ist verfügbar; vorhandene Sollwerte werden abgedeckt.' }]) => ({ summary: 'Vorschlag für P1 und G1.', warnings: ['Pausen müssen noch festgelegt werden.'], shifts })
const session = (storage = seeded(), task = 'plan', target = date) => prepareAiSession(storage, task, target)
const token = 'eyJhbGciOiJIUzI1NiJ9.user.signature'
const request = (body, headers = {}, method = 'POST') => new Request('https://local.test/caro-assistant', { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://marcelbeh.github.io', ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) })
const gemini = (value = answer(), extra = {}) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] }, ...extra }] }), { status: 200 })
function handler(patch = {}) { return createAssistantHandler({ apiKey: 'mock-key', model: 'gemini-3.8-flash', origins: ['https://marcelbeh.github.io'], authorize: async () => 'owner', fetch: async () => gemini(), ...patch }) }

test('Nur explizite, pseudonymisierte Felder: keine Namen, IDs, Gründe, Notizen, Freitexte oder Archive', () => {
  const storage = seeded({ employees: [{ ...employee, rules: [{ id: 'secret-rule', description: 'Geheime Freitextregel', type: 'wish', weekday: null }] }],
    absences: [{ id: 'secret-absence', employeeId: employee.id, employeeName: employee.name, startDate: date, endDate: date, portion: 'pm', type: 'sickness' }],
    events: [{ id: 'secret-event', title: 'Geheimer Termin', note: 'private@example.org', date, start: '08:00', end: '09:00', wholeTeam: true, employeeIds: [], groupIds: [], type: 'meeting', recurrence: 'once', until: '' }] })
  const before = [...storage.values], value = session(storage), wire = JSON.stringify(value.request)
  for (const secret of ['Private Person', 'private-person', 'private-group', 'Geheime', 'Geheimer', 'private@example.org', 'sickness', 'secret-', 'Private Notiz']) assert.ok(!wire.includes(secret), secret)
  assert.equal(value.request.absences[0].portion, 'pm'); assert.equal(value.request.people[0].manualRules[0].type, 'wish')
  assert.deepEqual(value.request.events[0].people, ['P1']); assert.equal(value.request.settings.early.minimum, 1)
  assert.equal(localAnswerText('P1 / G1', value), 'Private Person / Geheime Gruppe')
  assert.deepEqual([...storage.values], before); assert.equal(storage.writes, 0)
})

test('Strenges Antwortformat: erfundene Personen, Felder, Datum, Pausen und Wochenenden werden verworfen', () => {
  const s = session()
  for (const change of [{ person: 'P2' }, { group: 'G2' }, { date: '2027-01-05', start: '10:00', end: '09:00' }, { date: '2027-01-11' }, { date: '2027-01-09' }, { date: '2027-02-30' }, { breakMinutes: 30 }, { instruction: 'overwrite' }]) assert.throws(() => parseAnswer(answer([{ ...answer().shifts[0], ...change }]), s.request))
  assert.throws(() => parseAnswer({ ...answer(), summary: 'x'.repeat(2001) }, s.request))
  assert.throws(() => parseAnswer(answer(), session(seeded(), 'conflicts').request))
  assert.throws(() => parseRequest({ ...s.request, owner: 'other-user' }))
  assert.throws(() => parseRequest({ ...s.request, people: [{ ...s.request.people[0], name: employee.name }] }))
  assert.throws(() => parseRequest({ ...s.request, from: '2027-02-30' }))
})

test('Vorschau speichert nichts; bestätigte Übernahme nutzt einen atomaren Schreibvorgang und erhält vorhandene Dienste', () => {
  const existing = { id: 'existing', employeeId: employee.id, groupId: employee.groupId, date: '2027-01-11', start: '07:00', end: '08:00', breakMinutes: 10 }
  const storage = seeded({ shifts: [existing] }), before = [...storage.values], preview = aiPreview(session(storage), answer())
  assert.equal(preview.blockers.length, 0); assert.equal(preview.issues.filter(issue => issue.kind === 'conflict').length, 0)
  assert.equal(storage.writes, 0); assert.throws(() => adoptAi(storage, preview), /bestätigen/)
  assert.deepEqual([...storage.values], before)
  assert.equal(adoptAi(storage, preview, true), 1); assert.equal(storage.writes, 1)
  const saved = JSON.parse(storage.getItem(shiftsKey)).shifts
  assert.deepEqual(saved[0], existing); assert.equal(saved[1].employeeId, employee.id); assert.equal(saved[1].breakMinutes, undefined)
  for (const [key, value] of before) if (key !== shiftsKey) assert.equal(storage.getItem(key), value)
  assert.throws(() => adoptAi(storage, preview, true), /geändert/)
})

test('Übernahme blockiert Überschneidungen, Unterbesetzung, Abwesenheiten, Freitextregeln und konfigurierte Grenzen', () => {
  const absent = { id: 'abs', employeeId: employee.id, employeeName: employee.name, startDate: date, endDate: date, portion: 'full', type: 'vacation' }
  const cases = [
    { shifts: [{ id: 'existing', employeeId: employee.id, groupId: employee.groupId, date, start: '07:30', end: '08:30' }] },
    ...['full', 'am', 'pm'].map(portion => ({ absences: [{ ...absent, portion }] })),
    { employees: [{ ...employee, rules: [{ id: 'r', description: 'Sperre', type: 'must', weekday: 'mon' }] }] },
    { employees: [{ ...employee, weeklyMinutes: 120, availability: { start: '08:00', end: '10:00' } }] },
    { employees: [{ ...employee, weeklyMinutes: 60 }] },
    { setup: { ...setup, planningRules: { maxShiftMinutes: 120 } } },
    { setup: { ...setup, planningRules: { minRestMinutes: 800 } }, shifts: [{ id: 'sunday', employeeId: employee.id, groupId: employee.groupId, date: '2027-01-03', start: '18:00', end: '20:00' }] },
  ]
  for (const patch of cases) {
    const storage = seeded(patch), before = [...storage.values], preview = aiPreview(session(storage), answer())
    assert.ok(preview.blockers.length || preview.issues.some(issue => issue.kind === 'conflict'))
    assert.throws(() => adoptAi(storage, preview, true)); assert.equal(storage.writes, 0); assert.deepEqual([...storage.values], before)
  }
  const storage = seeded(), preview = aiPreview(session(storage), answer([{ ...answer().shifts[0], end: '08:00' }]))
  assert.ok(preview.issues.some(issue => issue.kind === 'conflict')); assert.throws(() => adoptAi(storage, preview, true))
})

test('Sondertermine bleiben lokale, sichtbare Hinweise; sie werden nicht als Freitext an Gemini gesendet', () => {
  const storage = seeded({ events: [{ id: 'event', title: 'Teambesprechung intern', note: 'Privat', date, start: '08:00', end: '09:00', wholeTeam: true, employeeIds: [], groupIds: [], type: 'meeting', recurrence: 'once', until: '' }] })
  const preview = aiPreview(session(storage), answer())
  assert.ok(preview.issues.some(issue => issue.kind === 'hint' && issue.cause.includes('Teambesprechung intern')))
  assert.ok(!JSON.stringify(preview.session.request).includes('Teambesprechung'))
})

test('Veröffentlichungen, Datenwechsel und Cloud-Arbeitsbereich schützen vor veralteter Übernahme', () => {
  for (const key of ['kitaplanio-lite:employees:v1', publicationKey, 'caro:sync-active:v1']) {
    const storage = seeded(), preview = aiPreview(session(storage), answer()), before = storage.getItem(shiftsKey)
    storage.values.set(key, 'changed')
    assert.throws(() => adoptAi(storage, preview, true)); assert.equal(storage.getItem(shiftsKey), before)
  }
  const storage = seeded(), source = session(storage)
  storage.values.set(publicationKey, JSON.stringify({ version: 1, plans: [{ ...teamPlan(source.context, date), version: 1, publishedAt: '2027-01-01T12:00:00Z' }] }))
  assert.throws(() => session(storage), /veröffentlicht/)
  assert.doesNotThrow(() => session(storage, 'conflicts'))
  const failed = seeded({ fail: true }), before = [...failed.values]
  assert.throws(() => adoptAi(failed, aiPreview(session(failed), answer()), true), /quota/)
  assert.deepEqual([...failed.values], before)
})

test('Monatsanalyse verwendet bestehende Netto-/Dienstzählung und keine Einzelpläne; fehlende/beschädigte Daten stoppen sicher', () => {
  const storage = seeded({ shifts: [{ id: 's', employeeId: employee.id, groupId: employee.groupId, date, start: '07:00', end: '10:00', breakMinutes: 30 }] })
  const data = session(storage, 'late').request
  assert.equal(data.from, '2027-01-01'); assert.equal(data.to, '2027-01-31'); assert.equal(data.hours[0].net, 150); assert.equal(data.hours[0].late, 1)
  assert.equal(data.settings, null); assert.equal(data.people[0].availability, null); assert.equal(data.people[0].manualRules, null); assert.equal(data.groups[0].periods, null); assert.deepEqual(data.shifts, []); assert.deepEqual(data.baseline, []); assert.deepEqual(data.absences, [])
  const broken = seeded(); broken.values.set(shiftsKey, '{broken')
  assert.throws(() => session(broken)); assert.equal(broken.writes, 0)
  assert.throws(() => session(seeded({ employees: [] })), /einrichten/)
})

test('Server-Autorisierung verifiziert JWT beim Auth-Server und prüft ausschließlich die eigene aktive caro_members-Zeile', async () => {
  const calls = []
  function client(user, member = user?.id, error = null, enabled = true) {
    const chain = { select: columns => { calls.push(['select', columns]); return chain }, eq: (key, value) => { calls.push(['eq', key, value]); return chain }, maybeSingle: async () => ({ data: member ? { user_id: member, enabled } : null, error }) }
    return { getUser: async jwt => { calls.push(['getUser', jwt]); return { data: { user }, error: null } }, getMember: async userId => { calls.push(['from', 'caro_members']); return chain.select('user_id').eq('user_id', userId).eq('enabled', true).maybeSingle() } }
  }
  assert.equal(await authorizeMember(client({ id: 'owner' }), token), 'owner')
  assert.ok(calls.some(call => call[0] === 'getUser' && call[1] === token))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === 'owner'))
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'enabled' && call[2] === true))
  for (const fake of [client(null), client({ id: 'owner', is_anonymous: true }), client({ id: 'owner' }, null), client({ id: 'owner' }, 'foreign'), client({ id: 'owner' }, 'owner', Error('rls')), client({ id: 'owner' }, 'owner', null, false)]) assert.equal(await authorizeMember(fake, token), null)
})

test('Edge verweigert nicht berechtigte Nutzer, fremden Origin und ungeeignete Eingaben ohne Gemini-Aufruf', async () => {
  let calls = 0; const mock = async () => { calls++; return gemini() }, payload = session().request
  const denied = handler({ authorize: async () => null, fetch: mock })
  assert.equal((await denied(request(payload))).status, 403)
  assert.equal((await denied(request(payload, { authorization: '' }))).status, 401)
  assert.equal((await handler({ fetch: mock })(request(payload, { origin: 'https://evil.test' }))).status, 403)
  assert.equal((await handler({ fetch: mock })(request({}, {}, 'GET'))).status, 405)
  assert.equal((await handler({ fetch: mock })(request({ ...payload, email: 'private@example.org' }))).status, 400)
  assert.equal((await handler({ fetch: mock })(request('x'.repeat(MAX_INPUT_BYTES + 1)))).status, 413)
  assert.equal((await handler({ fetch: mock })(request(payload, { 'content-type': 'text/plain' }))).status, 415)
  assert.equal((await handler({ fetch: mock, model: '' })(request(payload))).status, 503)
  assert.equal(calls, 0)
})

test('Gemini-Aufruf: begrenztes JSON, Secret nur im Header, validierte Antwort, keine Tools oder History', async () => {
  let outgoing
  const api = handler({ fetch: async (url, options) => { outgoing = { url, options }; return gemini() } })
  const response = await api(request(session().request))
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), answer())
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://marcelbeh.github.io')
  assert.ok(outgoing.url.endsWith('/models/gemini-3.8-flash:generateContent')); assert.ok(!outgoing.url.includes('mock-key'))
  assert.equal(outgoing.options.headers['x-goog-api-key'], 'mock-key')
  const body = JSON.parse(outgoing.options.body)
  assert.equal(body.generationConfig.maxOutputTokens, 8192); assert.equal(body.generationConfig.responseMimeType, 'application/json')
  assert.equal(body.contents.length, 1); assert.equal(body.tools, undefined)
  assert.ok(!JSON.stringify(body).includes(employee.name))
})

test('API-Fehler, blockierte/abgeschnittene/erfundene Antworten und Timeout bleiben ohne Datenänderung', async () => {
  const payload = session().request
  for (const upstream of [async () => new Response('private internal error', { status: 500 }), async () => gemini(answer(), { finishReason: 'MAX_TOKENS' }), async () => gemini(answer([{ ...answer().shifts[0], person: 'P99' }])), async () => new Response('{broken'), async () => new Response(JSON.stringify({ candidates: [] }))]) {
    const response = await handler({ fetch: upstream })(request(payload)); assert.equal(response.status, 502)
    assert.ok(!(await response.text()).includes('private internal error'))
  }
  assert.equal((await handler({ fetch: async () => new Response('', { status: 429 }) })(request(payload))).status, 429)
  const timeout = handler({ timeoutMs: 5, fetch: async (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Error('timeout')), { once: true })) })
  assert.equal((await timeout(request(payload))).status, 504)
})

test('Anfragelimit und Parallelität greifen pro freigeschaltetem Nutzer; keine automatische Wiederholung', async () => {
  let calls = 0, release
  const api = handler({ fetch: async () => { calls++; if (calls === 1) await new Promise(resolve => { release = resolve }); return gemini() } })
  const payload = session().request, first = api(request(payload))
  while (!release) await new Promise(resolve => setImmediate(resolve))
  assert.equal((await api(request(payload))).status, 429); release(); assert.equal((await first).status, 200)
  for (let i = 1; i < 20; i++) assert.equal((await api(request(payload))).status, 200)
  assert.equal((await api(request(payload))).status, 429); assert.equal(calls, 20)
})

test('Oberfläche verlangt aktive Zustimmung; Offline-Klick startet weder Auth- noch Gemini-Anfrage', async () => {
  const { createRequire } = await import('node:module'), { pathToFileURL } = await import('node:url')
  const require = createRequire(import.meta.url)
  const ui = await build({ entryPoints: ['src/modules/ki-assistent/AssistantPage.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'consent-harness', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'test' }))
    builder.onLoad({ filter: /hooks/, namespace: 'test' }, () => ({ contents: 'export const useState = initial => globalThis.aiUi.useState(initial); export const useRef = () => ({current:null}); export const useEffect = () => {};' }))
    builder.onResolve({ filter: /^react\// }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
    builder.onResolve({ filter: /cloud\/client$/ }, () => ({ path: 'client', namespace: 'test' }))
    builder.onLoad({ filter: /client/, namespace: 'test' }, () => ({ contents: 'export const cloudClient = () => { globalThis.aiUi.network++; throw Error("Unexpected request") };' }))
  } }] })
  const { AssistantPage } = await import(`data:text/javascript;base64,${Buffer.from(ui.outputFiles[0].text).toString('base64')}`)
  const prior = globalThis.aiUi, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), state = []
  const harness = { index: 0, network: 0, useState(initial) { const i = this.index++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next }] } }
  globalThis.aiUi = harness; Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } })
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  const render = () => { harness.index = 0; return nodes(AssistantPage()) }
  try {
    let tree = render(), prompt = tree.find(node => node.props?.className === 'ai-prompt')
    assert.equal(prompt.props.disabled, true); prompt.props.onClick(); assert.equal(harness.network, 0)
    tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
    tree = render(); prompt = tree.find(node => node.props?.className === 'ai-prompt'); assert.equal(prompt.props.disabled, false)
    prompt.props.onClick(); await new Promise(resolve => setImmediate(resolve))
    tree = render(); assert.ok(tree.some(node => node.props?.role === 'alert' && String(node.props.children).includes('offline')))
    assert.equal(harness.network, 0)
  } finally { globalThis.aiUi = prior; if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator }
})

test('CORS-Preflight erlaubt ausschließlich freigegebenen Origin, POST und SDK-Header; kein Auth-/Gemini-Aufruf', async () => {
  let auth = 0, upstream = 0
  const api = handler({ authorize: async () => { auth++; return 'owner' }, fetch: async () => { upstream++; return gemini() } })
  const headers = { authorization: '', 'access-control-request-method': 'POST', 'access-control-request-headers': 'Authorization, Content-Type, apikey, X-Supabase-Api-Version' }
  const good = await api(request(null, headers, 'OPTIONS'))
  assert.equal(good.status, 204); assert.equal(good.headers.get('access-control-allow-origin'), 'https://marcelbeh.github.io')
  assert.equal(good.headers.get('vary'), 'Origin')
  assert.equal((await api(request(null, { ...headers, 'access-control-request-method': 'PUT' }, 'OPTIONS'))).status, 405)
  assert.equal((await api(request(null, { ...headers, 'access-control-request-headers': 'X-Unapproved' }, 'OPTIONS'))).status, 403)
  for (const origin of ['null', 'https://marcelbeh.github.io.evil.test', 'http://marcelbeh.github.io']) {
    const denied = await api(request(null, { ...headers, origin }, 'OPTIONS'))
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null)
  }
  assert.equal(auth, 0); assert.equal(upstream, 0)
})

test('Mitgliedschaft wird nach Gemini erneut geprüft; deaktiviertes oder gewechseltes Konto erhält keine Antwortdaten', async () => {
  for (const finalUser of [null, 'foreign']) {
    let checks = 0
    const api = handler({ authorize: async () => ++checks === 1 ? 'owner' : finalUser })
    const response = await api(request(session().request))
    assert.equal(response.status, 403); assert.equal(checks, 2)
    const value = await response.json(); assert.equal(value.shifts, undefined); assert.equal(value.summary, undefined)
  }
})

test('Gemini-JSON-Schema bindet IDs/Datumswerte an die Anfrage und verhindert Schichten in Analysen', async () => {
  const s = session(), schema = answerSchemaFor(s.request)
  assert.deepEqual(schema.properties.shifts.items.properties.person.enum, ['P1'])
  assert.deepEqual(schema.properties.shifts.items.properties.group.enum, ['G1'])
  assert.deepEqual(schema.properties.shifts.items.properties.date.enum, ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'])
  assert.equal(answerSchemaFor(session(seeded(), 'late').request).properties.shifts.maxItems, 0)
  let sent
  const api = handler({ fetch: async (_, options) => { sent = JSON.parse(options.body); return gemini() } })
  assert.equal((await api(request(s.request))).status, 200)
  assert.deepEqual(sent.generationConfig.responseJsonSchema, schema)
})

test('Harte Deadline beendet auch nicht kooperative Auth-, Fetch- und Antwortstreams; keine automatische Wiederholung', async () => {
  const never = () => new Promise(() => {})
  for (const patch of [{ authorize: never }, { fetch: never }, { fetch: async () => new Response(new ReadableStream({ pull: never })) }]) {
    const response = await handler({ timeoutMs: 5, ...patch })(request(session().request))
    assert.equal(response.status, 504)
  }
})

test('Ungeklärte Pausen bleiben netto unbekannt; explizite Nullpause und mehrere Dienste rechnen korrekt', () => {
  const shift = { id: 's', employeeId: employee.id, groupId: employee.groupId, date, start: '07:00', end: '10:00' }
  assert.deepEqual(aiTimeSummary([shift]), { gross: 180, knownPause: 0, net: null, missing: 1 })
  const preview = aiPreview(session(), answer())
  assert.ok(preview.issues.some(issue => issue.id.startsWith('pause:') && issue.cause.includes('ungeklärt')))
  assert.ok(!preview.issues.some(issue => issue.id.startsWith('hours:') || issue.id.startsWith('distribution:')))
  assert.equal(session(seeded({ shifts: [shift] }), 'late').request.hours[0].net, null)
  assert.deepEqual(aiTimeSummary([{ ...shift, breakMinutes: 0 }, { ...shift, id: 's2', start: '11:00', end: '13:00', breakMinutes: 15 }]), { gross: 300, knownPause: 15, net: 285, missing: 0 })
  assert.equal(session(seeded({ shifts: [{ ...shift, breakMinutes: 0 }] }), 'late').request.hours[0].net, 180)
})

test('Letzte Speichersperre erkennt Publikationsänderung während der Generator-Prüfung', () => {
  const storage = seeded(), preview = aiPreview(session(storage), answer()), before = [...storage.values]
  let seenPublication = false, changed = false
  const guarded = { getItem(key) {
    if (key === publicationKey) seenPublication = true
    if (seenPublication && !changed && key === 'kitaplanio-lite:employees:v1') { changed = true; storage.values.set(publicationKey, JSON.stringify({ version: 1, plans: [] })) }
    return storage.getItem(key)
  }, setItem: storage.setItem }
  assert.throws(() => adoptAi(guarded, preview, true), /geändert/)
  assert.equal(changed, true); assert.equal(storage.writes, 0)
  for (const [key, value] of before) assert.equal(storage.getItem(key), value)
})

test('Cloud-Arbeitsbereich speichert gemeinsam in genau einem Cache-Schreibvorgang; Quota-Fehler erhalten Cache und lokale Originale', () => {
  for (const fail of [false, true]) {
    const raw = seeded({ fail }), owner = '11111111-1111-4111-8111-111111111111', cacheKey = `caro:sync-workspace:v1:${owner}`
    const payload = Object.fromEntries(AREAS.map(key => [key, raw.getItem(key) === null ? null : JSON.parse(raw.getItem(key))]))
    raw.values.set('caro:sync-active:v1', owner)
    raw.values.set(cacheKey, JSON.stringify({ version: 1, owner, revision: 1, base: payload, local: payload, lastSync: '2027-01-01T00:00:00Z' }))
    const before = [...raw.values], storage = createAppStorage(raw), preview = aiPreview(session(storage), answer())
    if (fail) { assert.throws(() => adoptAi(storage, preview, true), /quota/); assert.deepEqual([...raw.values], before); assert.equal(raw.writes, 0) }
    else {
      assert.equal(adoptAi(storage, preview, true), 1); assert.equal(raw.writes, 1)
      const cache = JSON.parse(raw.getItem(cacheKey)); assert.equal(cache.local[shiftsKey].shifts.length, 1)
      for (const [key, value] of before) if (key !== cacheKey) assert.equal(raw.getItem(key), value)
      for (const key of AREAS) if (key !== shiftsKey) assert.deepEqual(cache.local[key], payload[key])
    }
  }
})

test('Echte UI: gleiche Anmeldung erhält Vorschau; Storage-Änderung und Kontowechsel verwerfen sie; eigene Übernahme bleibt fehlerfrei', async () => {
  const { createRequire } = await import('node:module'), { pathToFileURL } = await import('node:url'), require = createRequire(import.meta.url)
  const bundle = await build({ entryPoints: ['src/modules/ki-assistent/AssistantPage.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'assistant-lifecycle', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'ui' }))
    b.onLoad({ filter: /hooks/, namespace: 'ui' }, () => ({ contents: 'export const useState = x => globalThis.liveUi.state(x); export const useRef = x => globalThis.liveUi.ref(x); export const useEffect = (fn,deps) => globalThis.liveUi.effect(fn,deps);' }))
    b.onResolve({ filter: /^react\// }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
    b.onResolve({ filter: /cloud\/client$/ }, () => ({ path: 'client', namespace: 'ui' }))
    b.onLoad({ filter: /client/, namespace: 'ui' }, () => ({ contents: 'export const cloudClient = () => ({client:globalThis.liveUi.client,message:""});' }))
    b.onResolve({ filter: /cloud\/access$/ }, () => ({ path: 'access', namespace: 'ui' }))
    b.onLoad({ filter: /access/, namespace: 'ui' }, () => ({ contents: 'export const verifyCloudAccess = async () => ({connected:true,userId:globalThis.liveUi.owner});' }))
  } }] })
  const { AssistantPage } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const priorUi = globalThis.liveUi, priorWindow = globalThis.window, descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const raw = seeded(), owner = '11111111-1111-4111-8111-111111111111', cacheKey = `caro:sync-workspace:v1:${owner}`
  const payload = Object.fromEntries(AREAS.map(key => [key, raw.getItem(key) === null ? null : JSON.parse(raw.getItem(key))]))
  raw.values.set('caro:sync-active:v1', owner); raw.values.set(cacheKey, JSON.stringify({ version: 1, owner, revision: 1, base: payload, local: payload, lastSync: '2027-01-01T00:00:00Z' }))
  const listeners = new Map(), slots = [], pending = []; let cursor = 0, authEvent
  const harness = { owner, client: { auth: { onAuthStateChange(fn) { authEvent = fn; return { data: { subscription: { unsubscribe() {} } } } } }, functions: { invoke: async () => ({ data: answer(), error: null }) } },
    state(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    ref(initial) { const i = cursor++; return slots[i] ??= { current: initial } },
    effect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) { previous?.cleanup?.(); slots[i] = { deps }; pending.push(() => { slots[i].cleanup = fn() }) } },
  }
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]
  const render = () => { cursor = 0; const tree = elements(AssistantPage()); pending.splice(0).forEach(fn => fn()); return tree }
  const button = (tree, text) => tree.find(node => node.type === 'button' && node.props.children === text)
  const showsPreview = tree => tree.some(node => node.type === 'h2' && node.props.children === 'Vorschau · noch nicht gespeichert')
  globalThis.liveUi = harness; globalThis.window = { localStorage: raw, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type), dispatchEvent: event => listeners.get(event.type)?.(event) }
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } })
  try {
    let tree = render()
    tree.find(node => node.type === 'input' && node.props.type === 'date').props.onChange({ target: { value: date } })
    tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.onChange({ target: { checked: true } })
    const ask = async () => { render().find(node => node.props?.className === 'ai-prompt').props.onClick(); await new Promise(resolve => setImmediate(resolve)); return render() }
    tree = await ask(); assert.ok(showsPreview(tree))
    assert.ok(tree.some(node => node.type === 'small' && String(node.props.children).includes('Netto ungeklärt')))
    authEvent('SIGNED_IN', { user: { id: owner } }); assert.ok(showsPreview(render()))
    const changed = JSON.parse(raw.getItem(cacheKey)); changed.local[shiftsKey].shifts.push({ id: 'later', employeeId: employee.id, groupId: employee.groupId, date: '2027-01-11', start: '07:00', end: '08:00' }); raw.values.set(cacheKey, JSON.stringify(changed))
    listeners.get('storage')(); assert.equal(showsPreview(render()), false)
    tree = await ask(); button(tree, 'Vorschlag übernehmen').props.onClick(); tree = render(); button(tree, 'Übernahme ausdrücklich bestätigen').props.onClick()
    await new Promise(resolve => setImmediate(resolve)); tree = render()
    assert.equal(showsPreview(tree), false); assert.ok(!tree.some(node => node.props?.role === 'alert'))
    assert.equal(JSON.parse(raw.getItem(cacheKey)).local[shiftsKey].shifts.length, 2)
    tree = await ask(); authEvent('SIGNED_IN', { user: { id: 'other' } }); tree = render()
    assert.equal(showsPreview(tree), false); assert.equal(tree.find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, false)
  } finally { slots.forEach(value => value?.cleanup?.()); globalThis.liveUi = priorUi; globalThis.window = priorWindow; if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator }
})
