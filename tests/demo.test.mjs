import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
async function bundle(path,render=false){
  const require=createRequire(import.meta.url)
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:render?[{name:'react',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}))}}]:[]})
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const {buildDemo,loadDemo,demoAvailability}=await bundle('src/modules/einstellungen/demo.ts')
const {AREAS,payloadStorage,validatePayload}=await bundle('src/cloud/dataset.ts')
const {ACTIVE_KEY,CACHE_PREFIX}=await bundle('src/cloud/workspace.ts')
const {startInterview,INTERVIEW_KEY}=await bundle('src/modules/kita/interview.ts')
const {loadSetup}=await bundle('src/modules/kita/setup.ts')
const {loadEmployees}=await bundle('src/modules/mitarbeiter/employees.ts')
const {loadShifts,workTime,calendarWeek,localDate,visibleScheduleDays}=await bundle('src/modules/dienstplan/schedule.ts')
const {loadAbsences}=await bundle('src/modules/abwesenheiten/absences.ts')
const {loadEvents,listOccurrences}=await bundle('src/modules/termine/events.ts')
const {checkPlan}=await bundle('src/modules/dienstplan/checks.ts')
const {calculateStaffing}=await bundle('src/modules/dienstplan/staffing.ts')
const {prepareReset,verifyResetBackup,resetLocalApp,RESET_PHRASE}=await bundle('src/modules/einstellungen/reset.ts')
const {shiftPeriods}=await bundle('src/modules/dienstplan/presentation.ts')
const date='2027-01-04'
function memory(){const values=new Map([['caro:auth:v1','auth unchanged'],[CACHE_PREFIX+'owner','offline unchanged'],['foreign','unchanged']]);return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
function read(s){return{setup:loadSetup(s),employees:loadEmployees(s).employees,shifts:loadShifts(s),absences:loadAbsences(s).absences,events:loadEvents(s)}}

test('11 eindeutig fiktive Mitarbeitende in 3/4/4 Gruppen, vollständige Mo–Fr-Woche und plausible Netto-Vertragszeiten',()=>{
  const demo=buildDemo(date),s=payloadStorage(validatePayload(demo.payload)),data=read(s)
  assert.deepEqual(data.setup.groups.map(g=>g.name),['Nest','Sonne','Sterne'])
  assert.deepEqual(data.setup.groups.map(g=>data.employees.filter(p=>p.groupId===g.id).length),[3,4,4])
  assert.equal(data.employees.length,11);assert.equal(new Set(data.employees.map(p=>p.name)).size,11)
  assert.ok(data.employees.every(p=>p.name.startsWith('DEMO · ')))
  assert.deepEqual(data.setup.opening,{start:'07:00',end:'16:00'});assert.equal(data.setup.early.end,'08:00');assert.equal(data.setup.late.start,'15:00')
  assert.equal(data.shifts.length,53);assert.equal(new Set(data.shifts.map(s=>s.date)).size,5)
  assert.ok(data.shifts.every(s=>s.date>=demo.monday&&s.date<=calendarWeek(date).days[4]&&s.start>='07:00'&&s.end<='16:00'&&Number.isSafeInteger(s.breakMinutes)))
  for(const person of data.employees){
    const total=workTime(data.shifts.filter(s=>s.employeeId===person.id)).net
    const absentMinutes=data.absences.some(a=>a.employeeId===person.id&&a.portion==='full')?(person.weeklyMinutes/5):0
    assert.equal(total,person.weeklyMinutes-absentMinutes)
  }
  assert.equal(workTime(data.shifts).net,333*60)
})
test('Cloud-Sperre, ausdrückliche Freigabe und Bestandsschutz für jeden Key, beschädigte Daten und beantwortete Interviews',()=>{
  let s=memory();const before=[...s.values]
  assert.throws(()=>loadDemo(s,date,false),/bestätigen/);assert.deepEqual([...s.values],before)
  for(const key of [...AREAS,ACTIVE_KEY]){
    s=memory();s.setItem(key,'');const before=[...s.values]
    assert.throws(()=>loadDemo(s,date,true));assert.deepEqual([...s.values],before)
  }
  s=memory();const flow=startInterview(s);flow.setup.name='Echte Kita';s.setItem(INTERVIEW_KEY,JSON.stringify(flow))
  assert.throws(()=>demoAvailability(s),/nicht überschrieben/)
})
test('Nur ein exakt unberührter automatisch angelegter Einrichtungsentwurf zählt als uninitialisiert; P9 entfernt die Demo vollständig',()=>{
  const s=memory(),flow=startInterview(s);s.setItem(INTERVIEW_KEY,JSON.stringify({...flow,paused:true}))
  loadDemo(s,date,true);assert.equal(loadEmployees(s).employees.length,11)
  const before=[...s.values];assert.throws(()=>loadDemo(s,date,true),/nicht überschrieben/);assert.deepEqual([...s.values],before)
  const backup=prepareReset(s);resetLocalApp(s,backup,verifyResetBackup(JSON.stringify(backup),backup),RESET_PHRASE)
  assert.ok(AREAS.every(key=>s.getItem(key)===null));assert.equal(s.getItem('caro:auth:v1'),'auth unchanged');assert.equal(s.getItem(CACHE_PREFIX+'owner'),'offline unchanged');assert.equal(s.getItem('foreign'),'unchanged')
})
test('Schreibfehler oder paralleler Cloud-Wechsel rollen die Demo zurück und überschreiben keine ursprünglichen Werte',()=>{
  for(const activate of [false,true]){
    const s=memory(),flow=JSON.stringify(startInterview(s));s.setItem(INTERVIEW_KEY,flow);const set=s.setItem
    s.setItem=(key,value)=>{if(key===AREAS[2]){if(activate)s.values.set(ACTIVE_KEY,'owner');else throw Error('quota')}set(key,value)}
    assert.throws(()=>loadDemo(s,date,true),/abgebrochen/)
    assert.equal(s.getItem(INTERVIEW_KEY),flow);assert.ok(AREAS.filter(key=>key!==INTERVIEW_KEY).every(key=>s.getItem(key)===null));assert.equal(s.getItem('caro:auth:v1'),'auth unchanged')
  }
})
test('Kirchlicher Sonntagstermin ohne Wochenendschichten/-bedarf; bestehende Prüfung meldet Pausen/Halbtage ohne erfundene Zeiten',()=>{
  for(const day of [date,'2027-01-01']){
    const demo=buildDemo(day),data=read(payloadStorage(demo.payload)),week=calendarWeek(day)
    const church=data.events.find(e=>e.id==='demo-church');assert.equal(church.date,week.days[6]);assert.match(church.title,/Gottesdienst/i)
    assert.equal(data.shifts.filter(s=>s.date>=week.days[5]).length,0)
    const occurrences=listOccurrences(data.events,week.monday,week.days[6]);assert.equal(visibleScheduleDays(week.days,week.monday,data.shifts,data.absences,occurrences.map(e=>e.date)).length,7)
    for(const day of week.days.slice(5))assert.equal(calculateStaffing(day,data.setup,data.shifts,data.absences,data.employees).status,'unspecified')
    const issues=checkPlan({from:week.monday,to:week.days[6],setup:data.setup,employees:data.employees,absences:data.absences,inspection:{entries:data.shifts}})
    assert.ok(issues.some(i=>i.id.startsWith('pause:')));assert.ok(issues.some(i=>i.id.startsWith('half:')))
    assert.ok(!issues.some(i=>/overlap|invalid|absence-full/.test(i.id)))
  }
})
test('Dienstkennzeichnungen verwenden Konfigurationsgrenzen inkl. exakt angrenzender Zeiten, Wochenende bleibt Sonderdienst',()=>{
  const data=read(payloadStorage(buildDemo(date).payload)),base=data.shifts[0],kinds=(start,end)=>shiftPeriods({...base,start,end},data.setup).map(p=>p.kind)
  assert.deepEqual(kinds('07:00','08:00'),['early']);assert.deepEqual(kinds('08:00','15:00'),['core']);assert.deepEqual(kinds('15:00','16:00'),['late'])
  assert.deepEqual(kinds('07:00','15:00'),['early','core']);assert.deepEqual(kinds('08:00','16:00'),['core','late'])
  assert.deepEqual(shiftPeriods({...base,date:'2027-01-10'},data.setup).map(p=>p.kind),['special'])
  assert.deepEqual(shiftPeriods(base,null),[])
})
test('Dienstplan rendert 11 kompakte mobile Karten in drei Gruppen, Tageswahl und direkt bedienbare Schichten',async()=>{
  const {SchedulePage}=await bundle('src/modules/dienstplan/SchedulePage.tsx',true),s=memory();loadDemo(s,localDate(),true)
  const oldWindow=globalThis.window;globalThis.window={localStorage:s}
  try{
    const html=renderToStaticMarkup(createElement(SchedulePage))
    assert.equal((html.match(/class="schedule-person-name"/g)??[]).length,11)
    assert.equal((html.match(/class="schedule-person-group"/g)??[]).length,3)
    assert.match(html,/Wochentag auswählen/);assert.match(html,/Teamansicht nach Stammgruppe/);assert.match(html,/DEMO · ausschließlich fiktive Testdaten/)
    const buttons=[...html.matchAll(/<button[^>]*class="schedule-shift schedule-shift-action[^>]*>([\s\S]*?)<\/button>/g)]
    assert.ok(buttons.length>11);assert.ok(buttons.every(([,contents])=>!contents.includes('<button')&&contents.includes('Schicht bearbeiten:')&&contents.includes('Pause')))
    assert.match(html,/Personalbedarf/);assert.match(html,/Dienstplan veröffentlichen/)
  }finally{globalThis.window=oldWindow}
})
