import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
async function bundle(path,hooks=false){
  const require=createRequire(import.meta.url)
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:hooks?[{name:'month-hooks',setup(b){
    b.onResolve({filter:/^react$/},()=>({path:'hooks',namespace:'test-hooks'}))
    b.onLoad({filter:/.*/,namespace:'test-hooks'},()=>({contents:`export const useState = value => globalThis.monthHooks ? globalThis.monthHooks.useState(value) : [typeof value === 'function' ? value() : value, () => {}]; export const useEffect = () => {}; export const useRef = () => ({current:null});`}))
    b.onResolve({filter:/^react\//},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}))
  }}]:[]})
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const {monthBounds,moveMonth,monthOverview}=await bundle('src/modules/dienstplan/month.ts')
const {buildDemo}=await bundle('src/modules/einstellungen/demo.ts')
const {payloadStorage}=await bundle('src/cloud/dataset.ts')
const {loadSetup}=await bundle('src/modules/kita/setup.ts')
const {loadEmployees}=await bundle('src/modules/mitarbeiter/employees.ts')
const {loadShifts}=await bundle('src/modules/dienstplan/schedule.ts')
const {loadAbsences}=await bundle('src/modules/abwesenheiten/absences.ts')
const {loadEvents,newEvent}=await bundle('src/modules/termine/events.ts')
const {checkPlan}=await bundle('src/modules/dienstplan/checks.ts')
const {calculateStaffing}=await bundle('src/modules/dienstplan/staffing.ts')
const {MonthView}=await bundle('src/modules/dienstplan/MonthView.tsx',true)
const {SchedulePage}=await bundle('src/modules/dienstplan/SchedulePage.tsx',true)
const date='2027-01-04'
function fixture(){const storage=payloadStorage(buildDemo(date).payload),shifts=loadShifts(storage);return{setup:loadSetup(storage),employees:loadEmployees(storage).employees,shifts,absences:loadAbsences(storage).absences,events:loadEvents(storage),inspection:{entries:shifts},errors:[]}}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}

test('Monatswechsel ohne Überlauf, Schaltjahre, ISO-Jahreswechsel und unterstützte Datumsgrenzen',()=>{
  assert.equal(moveMonth('2027-01-31',1),'2027-02-01');assert.equal(moveMonth('2027-12-31',1),'2028-01-01');assert.equal(moveMonth('2027-01-31',-1),'2026-12-01')
  assert.equal(monthBounds('2024-02-20').to,'2024-02-29');assert.equal(monthBounds('1900-02-01').to,'1900-02-28');assert.equal(monthBounds('2000-02-01').to,'2000-02-29')
  assert.throws(()=>monthBounds('2027-02-30'));assert.throws(()=>moveMonth('0002-01-01',-1));assert.throws(()=>moveMonth('9998-12-01',1))
  const month=monthOverview(date,fixture());assert.equal(month.weeks[0],'2026-12-28');assert.equal(month.from,'2027-01-01');assert.equal(month.to,'2027-01-31')
})
test('P10: alle 11 Personen, dynamische Stammgruppen 3/4/4 und ausschließlich vorhandene Monats-Nettozeiten',()=>{
  const data=fixture(),all=monthOverview(date,data)
  assert.equal(all.hours.length,11);assert.equal(all.hours.reduce((sum,p)=>sum+p.net,0),333*60)
  for(const [i,count,hours] of [[0,3,90.5],[1,4,116],[2,4,126.5]]){
    const group=monthOverview(date,data,data.setup.groups[i].id)
    assert.equal(group.hours.length,count);assert.equal(group.hours.reduce((sum,p)=>sum+p.net,0),hours*60)
    assert.ok(group.hours.every(p=>p.groupId===data.setup.groups[i].id))
    assert.deepEqual(group.days.find(d=>d.date===date).staffing,all.days.find(d=>d.date===date).staffing)
  }
})
test('Monatsgrenzen, mehrere Schichten und Wochenendstunden; Personen und Halbtage werden nicht doppelt gezählt',()=>{
  const data=fixture(),base=data.shifts.find(s=>s.employeeId==='demo-person-0')
  data.shifts=[{...base,id:'jan-a',date:'2027-01-31',start:'10:00',end:'12:00',breakMinutes:15},{...base,id:'jan-b',date:'2027-01-31',start:'13:00',end:'14:00',breakMinutes:0},{...base,id:'feb',date:'2027-02-01',start:'10:00',end:'11:00',breakMinutes:0},{...base,id:'dec',date:'2026-12-31',start:'10:00',end:'11:00',breakMinutes:0}]
  const absence={employeeId:base.employeeId,employeeName:base.employeeName,type:'other',startDate:'2027-01-31',endDate:'2027-01-31'}
  data.absences=[{...absence,id:'am',portion:'am'},{...absence,id:'pm',portion:'pm'}];data.inspection={entries:data.shifts}
  const month=monthOverview(date,data),day=month.days.find(d=>d.date==='2027-01-31')
  assert.equal(month.hours.find(p=>p.id===base.employeeId).net,165);assert.equal(day.planned,1);assert.equal(day.absent,1)
  assert.equal(monthOverview('2027-02-01',data).hours.find(p=>p.id===base.employeeId).net,60)
})
test('Nur vorhandene relevante Wochenendtermine/-schichten erscheinen, einschließlich wiederkehrender Termine',()=>{
  const data=fixture(),base=data.shifts.find(s=>s.employeeId==='demo-person-0')
  data.shifts.push({...base,id:'special',date:'2027-01-23'});data.inspection={entries:data.shifts}
  data.events.push({...newEvent('sat-series'),title:'Kirchlicher Samstagstermin',date:'2027-01-02',start:'10:00',end:'11:00',recurrence:'weekly',until:'2027-01-16',groupIds:['demo-group-0']},{...newEvent('sun-sonne'),title:'Sonne-Sondertermin',date:'2027-01-17',start:'10:00',end:'11:00',groupIds:['demo-group-1']})
  const all=monthOverview(date,data),nest=monthOverview(date,data,'demo-group-0'),sonne=monthOverview(date,data,'demo-group-1')
  assert.deepEqual(all.days.filter(d=>d.weekend).map(d=>d.date),['2027-01-02','2027-01-09','2027-01-10','2027-01-16','2027-01-17','2027-01-23'])
  assert.ok(!nest.days.some(d=>d.date==='2027-01-17'));assert.ok(!sonne.days.some(d=>d.date==='2027-01-23'))
  assert.ok(all.days.filter(d=>d.weekend).every(d=>d.staffing.status==='unspecified'))
})
test('Konflikte und Personalampel entsprechen den vorhandenen Wochenfunktionen; Quelldaten bleiben unverändert',()=>{
  const data=fixture(),base=data.shifts.find(s=>s.employeeId==='demo-person-0'&&s.date===date)
  data.shifts.push({...base,id:'overlap',start:'07:30',end:'08:30',breakMinutes:0});data.inspection={entries:data.shifts}
  const frozen=JSON.stringify(data),month=monthOverview(date,data),day=month.days.find(d=>d.date===date)
  const issues=checkPlan({from:date,to:'2027-01-10',...data}).filter(i=>i.date===date)
  assert.equal(day.conflicts,issues.filter(i=>i.kind==='conflict').length);assert.ok(day.conflicts>0)
  assert.equal(day.hints,issues.filter(i=>i.kind==='hint').length)
  assert.deepEqual(day.staffing,calculateStaffing(date,data.setup,data.shifts,data.absences,data.employees))
  assert.equal(JSON.stringify(data),frozen)
})
test('Monatsnavigation, dynamischer Filter und Tagesauswahl reichen exakte Werte an den bestehenden Dienstplan weiter',()=>{
  const calls=[],data=fixture(),tree=nodes(MonthView({date,data,filter:'',onFilter:id=>calls.push(['group',id]),onDate:date=>calls.push(['month',date]),onOpenDay:date=>calls.push(['day',date])}))
  tree.find(n=>n.props?.['aria-label']==='Nächster Monat').props.onClick()
  tree.find(n=>n.type==='select').props.onChange({target:{value:'demo-group-1'}})
  tree.find(n=>n.type==='button'&&n.props.value==='2027-01-10').props.onClick()
  assert.deepEqual(calls,[['month','2027-02-01'],['group','demo-group-1'],['day','2027-01-10']])
  assert.deepEqual(tree.filter(n=>n.type==='option').map(n=>n.props.children),['Gesamtes Team','Nest','Sonne','Sterne'])
})
test('Tagesklick schaltet vom Monat in die richtige Woche und fokussiert auf iPhone/ Desktop den gewählten Tag',()=>{
  const oldWindow=globalThis.window,oldDocument=globalThis.document,oldHooks=globalThis.monthHooks
  for(const mobile of [true,false]){
    const storage=payloadStorage(buildDemo(date).payload),state=[],focused=[]
    const hooks={cursor:0,useState(initial){const i=this.cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]}}
    globalThis.monthHooks=hooks;globalThis.window={localStorage:storage,requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:mobile})};globalThis.document={getElementById:id=>({focus(){focused.push(id)},scrollIntoView(){}})}
    try{
      const render=()=>{hooks.cursor=0;return nodes(SchedulePage())}
      render().find(n=>n.type==='button'&&n.props.children==='Monat').props.onClick()
      const monthly=render().find(n=>n.props?.onOpenDay)
      monthly.props.onDate('2027-02-01');assert.equal(render().find(n=>n.props?.onOpenDay).props.date,'2027-02-01')
      monthly.props.onOpenDay('2027-01-10')
      const week=render();assert.ok(!week.some(n=>n.props?.onOpenDay));assert.equal(week.find(n=>n.type==='input'&&n.props.type==='date').props.value,'2027-01-10')
      assert.ok(focused.includes(mobile?'schedule-day-heading':'schedule-date-2027-01-10'))
    }finally{globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.monthHooks=oldHooks}
  }
})

test('Monatsstunden bleiben bei fehlenden Pausen, Überschneidungen oder unlesbaren Schichten ungeklärt statt erfundener Nettozeit',()=>{
  const data=fixture(),base=data.shifts[0]
  data.shifts=[{...base,id:'unknown',date,start:'07:00',end:'10:00'}];delete data.shifts[0].breakMinutes
  data.inspection={entries:data.shifts}
  const original=JSON.stringify(data),row=monthOverview(date,data).hours.find(person=>person.id===base.employeeId)
  assert.equal(row.net,null);assert.equal(JSON.stringify(data),original)
  const rendered=nodes(MonthView({date,data,filter:'',onFilter(){},onDate(){},onOpenDay(){}}))
  assert.ok(rendered.some(node=>node.type==='dd'&&node.props.children==='ungeklärt'))
  data.shifts[0].breakMinutes=0
  assert.equal(monthOverview(date,data).hours.find(person=>person.id===base.employeeId).net,180)
  data.shifts.push({...data.shifts[0],id:'overlap',start:'09:00',end:'11:00'})
  assert.equal(monthOverview(date,data).hours.find(person=>person.id===base.employeeId).net,null)
  data.shifts=[];data.inspection={entries:[],problem:'Nicht lesbar'};data.errors=['Schichten konnten nicht geladen werden.']
  assert.ok(monthOverview(date,data).hours.every(person=>person.net===null))
})
