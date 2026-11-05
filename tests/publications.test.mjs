import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const result = await build({ entryPoints: ['src/modules/dienstplan/publications.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { PUBLICATIONS_KEY, loadPublications, preparePublication, publishWeek, teamPlan, publicationStatus } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const rendered = await build({ entryPoints: ['src/modules/dienstplan/TeamPlan.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{ name: 'react', setup(builder) { builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true })) } }] })
const { TeamPlan } = await import(`data:text/javascript;base64,${Buffer.from(rendered.outputFiles[0].text).toString('base64')}`)
const date = '2027-01-04', shiftsKey = 'kitaplanio-lite:shifts:v1', employeesKey = 'kitaplanio-lite:employees:v1', setupKey = 'kitaplanio-lite:kita:v1'
const settings = { version: 1, completed: true, name: 'Kita Sonnenhaus', careDays: ['mon'], opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g', name: 'Sonne', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] }
const employee = { id: 'a', name: 'Anna', groupId: 'g', qualification: 'Vertrauliche Qualifikation', weeklyMinutes: 600, workdays: ['mon'], availability: { start: '07:00', end: '22:00' }, fixedTimes: {}, rules: [] }
const shift = { id: 's1', employeeId: 'a', groupId: 'g', date, start: '07:00', end: '10:00', breakMinutes: 0, privateNote: 'Interne Notiz' }
function memory(shifts = [shift]) {
  const values = new Map([[setupKey, JSON.stringify(settings)], [employeesKey, JSON.stringify({ version: 1, employees: [employee] })], [shiftsKey, JSON.stringify({ version: 1, shifts })]])
  const writes = []
  return { values, writes, getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push(key); values.set(key, value) } }
}
const source = s => ({ setup: JSON.parse(s.getItem(setupKey)), employees: JSON.parse(s.getItem(employeesKey)).employees, shifts: JSON.parse(s.getItem(shiftsKey)).shifts })

test('Freigabe verlangt Bestätigung, prüft harte Konflikte und schreibt ausschließlich den neuen Speicherbereich', () => {
  const s = memory(), before = [...s.values], token = preparePublication(s,date)
  assert.equal(publicationStatus(teamPlan(source(s),date),[]),'Entwurf')
  assert.throws(()=>publishWeek(s,token),/bestätigen/)
  assert.deepEqual([...s.values],before)
  const published = publishWeek(s,token,true,'2027-01-01T12:00:00.000Z')
  assert.equal(published.version,1); assert.deepEqual(s.writes,[PUBLICATIONS_KEY])
  assert.equal(publicationStatus(teamPlan(source(s),date),loadPublications(s).plans),'Veröffentlicht')
  for (const [key,value] of before) assert.equal(s.getItem(key),value)
  const overlapping = memory([shift,{...shift,id:'s2'}])
  assert.throws(()=>publishWeek(overlapping,preparePublication(overlapping,date),true),/Harte Konflikte/)
  assert.equal(overlapping.writes.length,0)
  const absent = memory()
  absent.values.set('kitaplanio-lite:absences:v1',JSON.stringify({version:1,absences:[{id:'a1',employeeId:'a',employeeName:'Anna',type:'sickness',startDate:date,endDate:date,portion:'full'}]}))
  assert.throws(()=>publishWeek(absent,preparePublication(absent,date),true),/Harte Konflikte/)
})

test('Versionen sind unverändert und nach Neustart verfügbar; bearbeiteter Arbeitsplan führt zu Version 2', () => {
  const s = memory(), first = publishWeek(s,preparePublication(s,date),true,'2027-01-01T12:00:00.000Z'), frozen = JSON.stringify(first)
  s.values.set(shiftsKey,JSON.stringify({version:1,shifts:[{...shift,end:'11:00'}]}))
  s.values.set(employeesKey,JSON.stringify({version:1,employees:[{...employee,name:'Anna geändert'}]}))
  assert.equal(publicationStatus(teamPlan(source(s),date),loadPublications(s).plans),'Änderungen seit Veröffentlichung')
  const second = publishWeek(s,preparePublication(s,date),true,'2027-01-02T12:00:00.000Z')
  assert.equal(second.version,2)
  assert.equal(JSON.stringify(loadPublications({getItem:s.getItem}).plans[0]),frozen)
  assert.equal(loadPublications(s).plans[0].employees[0].name,'Anna')
  assert.equal(loadPublications(s).plans[1].employees[0].name,'Anna geändert')
  assert.equal(publicationStatus(teamPlan(source(s),date),loadPublications(s).plans),'Veröffentlicht')
  assert.equal(JSON.stringify(first),frozen)
})

test('Geänderte Daten/Versionen, beschädigter Speicher und Schreibfehler führen zu keinem Überschreiben', () => {
  for (const key of [setupKey,employeesKey,shiftsKey,'kitaplanio-lite:absences:v1','kitaplanio-lite:events:v1']) {
    const s = memory(), token = preparePublication(s,date)
    // Whitespace is a source change without invalidating the original payload.
    const current = s.getItem(key)
    s.values.set(key,current === null ? (key.includes('absences') ? '{"version":1,"absences":[]}' : '{"version":1,"events":[]}') : current+' ')
    assert.throws(()=>publishWeek(s,token,true),/inzwischen geändert/)
    assert.equal(s.getItem(PUBLICATIONS_KEY),null)
  }
  const s = memory(), first = preparePublication(s,date), other = preparePublication(s,date)
  publishWeek(s,first,true)
  const before = s.getItem(PUBLICATIONS_KEY)
  assert.throws(()=>publishWeek(s,other,true),/inzwischen geändert/)
  assert.equal(s.getItem(PUBLICATIONS_KEY),before)
  for (const raw of ['broken','{"version":2,"plans":[]}','{"version":1,"plans":[{}]}']) {
    s.values.set(PUBLICATIONS_KEY,raw)
    assert.throws(()=>preparePublication(s,date))
    assert.equal(s.getItem(PUBLICATIONS_KEY),raw)
  }
  const fresh = memory(), token = preparePublication(fresh,date)
  assert.throws(()=>publishWeek({getItem:fresh.getItem,setItem(){throw Error('Speicher voll')}},token,true),/Speicher voll/)
  assert.equal(fresh.getItem(PUBLICATIONS_KEY),null)
})

test('Team-Ausgabe zeigt Samstag/Sonntag, Version und Zeiten, ohne vertrauliche Gründe oder interne Daten', () => {
  const s = memory([shift,{...shift,id:'sat',date:'2027-01-09',start:'18:00',end:'20:00',breakMinutes:15},{...shift,id:'sun',date:'2027-01-10',start:'18:00',end:'20:00',breakMinutes:0}])
  s.values.set('kitaplanio-lite:absences:v1',JSON.stringify({version:1,absences:[{id:'unrelated',employeeId:'a',employeeName:'Anna',type:'sickness',startDate:'2027-01-11',endDate:'2027-01-11',portion:'full'}]}))
  const pub = publishWeek(s,preparePublication(s,date),true,'2027-01-01T12:00:00.000Z')
  const html = renderToStaticMarkup(createElement(TeamPlan,{plan:pub,published:pub,preview:true}))
  assert.match(html,/Veröffentlicht · Version 1/)
  assert.match(html,/Samstag/); assert.match(html,/Sonntag/); assert.match(html,/06:45/)
  assert.match(html,/Kita Sonnenhaus/); assert.match(html,/KW 1\/2027/)
  assert.doesNotMatch(html,/<button|<input|<select|Krankheit|sickness|Vertrauliche Qualifikation|Interne Notiz|Konflikt|weeklyMinutes|preferences/)
  const raw = s.getItem(PUBLICATIONS_KEY)
  assert.doesNotMatch(raw,/sickness|qualification|privateNote|weeklyMinutes|availability|rules|preferences/)
  const draft = renderToStaticMarkup(createElement(TeamPlan,{plan:teamPlan(source(s),date)}))
  assert.match(draft,/Entwurf · aktueller Arbeitsplan · nicht veröffentlicht/)
  assert.doesNotMatch(draft,/Veröffentlicht · Version/)
})

test('A4-Querformat: statisches Mindesthöhenbudget für 11 Personen; kein Ersatz für echten PDF-Seitennachweis', async () => {
  const { readFileSync } = await import('node:fs')
  const css=readFileSync('src/modules/dienstplan/print.css','utf8')
  const rule=(selector,property)=>{
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    const blocks=[...css.matchAll(new RegExp(escaped+'\\s*\\{([^}]+)\\}','g'))]
    const values=blocks.flatMap(match=>[...match[1].matchAll(new RegExp('(?:^|;)\\s*'+property+'\\s*:\\s*([0-9.]+)','g'))].map(value=>Number(value[1])))
    assert.ok(values.length,`${selector} ${property}`);return values.at(-1)
  }
  const row=rule('.team-plan table','font-size'),small=rule('.team-plan small','font-size'),line=rule('.team-plan th, .team-plan td','line-height'),padding=rule('.team-plan th, .team-plan td','padding')
  const plan=teamPlan(source(memory()),date)
  plan.employees=Array.from({length:11},(_,i)=>({id:`test-${i}`,name:`Testperson ${i+1}`}))
  plan.shifts=plan.employees.flatMap(person=>Array.from({length:5},(_,i)=>({...shift,id:`${person.id}-${i}`,employeeId:person.id,date:`2027-01-0${4+i}`})))
  const html=renderToStaticMarkup(createElement(TeamPlan,{plan}))
  const duplicateDaily=html.includes('class="team-day-total"')
  const rowMinimum=2*row*line+small*line+2*padding+(duplicateDaily?small*line+4.5:0)
  const available=(210-20)*72/25.4 // A4 landscape, existing 10 mm margins.
  assert.ok(11*rowMinimum+100<=available,'11 normale Mitarbeiterzeilen lassen schon rechnerisch keinen Platz für Kopf/Fuß auf einer Seite')
})

test('Einzelne Schicht trägt bereits die Tagessumme; geteilte Dienste behalten ihre gemeinsame Summe und alle Informationen',()=>{
  const plan=teamPlan(source(memory()),date)
  let html=renderToStaticMarkup(createElement(TeamPlan,{plan}))
  assert.doesNotMatch(html,/class="team-day-total"/)
  assert.match(html,/07:00–10:00/);assert.match(html,/Pause:.*00:00/);assert.match(html,/03:00/)
  plan.shifts.push({...shift,id:'second',start:'11:00',end:'12:00'})
  html=renderToStaticMarkup(createElement(TeamPlan,{plan}))
  assert.match(html,/11:00–12:00/);assert.match(html,/class="team-day-total">Tag netto: 04:00/)
  assert.match(html,/Anna/);assert.match(html,/Sonne/)
})
