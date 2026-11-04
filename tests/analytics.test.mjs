import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
async function bundle(path,render=false){const require=createRequire(import.meta.url);const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',loader:{'.css':'empty'},plugins:render?[{name:'react',setup(b){b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}))}}]:[]});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`)}
const {analyticsReport,reportRange,moveReport,sortReport,readAnalyticsData}=await bundle('src/modules/auswertungen/analytics.ts')
const {buildDemo}=await bundle('src/modules/einstellungen/demo.ts')
const {payloadStorage}=await bundle('src/cloud/dataset.ts')
const {loadSetup}=await bundle('src/modules/kita/setup.ts')
const {loadEmployees}=await bundle('src/modules/mitarbeiter/employees.ts')
const {loadShifts,SHIFTS_KEY,localDate}=await bundle('src/modules/dienstplan/schedule.ts')
const {loadAbsences}=await bundle('src/modules/abwesenheiten/absences.ts')
const date='2027-01-04'
function fixture(){const storage=payloadStorage(buildDemo(date).payload);return{setup:loadSetup(storage),employees:loadEmployees(storage).employees,shifts:loadShifts(storage),absences:loadAbsences(storage).absences}}
const shifted=(base,id,date,start,end,breakMinutes=0)=>({...base,id,date,start,end,breakMinutes})

test('Nettozeit wird trotz mehrerer Dienstarten und Teilschichten nur einmal addiert; Arten zählen je Person/Tag',()=>{
  const data=fixture(),base=data.shifts.find(s=>s.employeeId==='demo-person-0'),other=data.shifts.find(s=>s.employeeId==='demo-person-1')
  data.absences=[];data.shifts=[shifted(base,'a',date,'07:00','09:00'),shifted(base,'b',date,'14:00','16:00',15),shifted(base,'c','2027-01-05','09:00','10:00'),shifted(other,'d',date,'08:00','10:00',30)]
  const frozen=JSON.stringify(data),report=analyticsReport(data,'week',date),row=report.rows.find(r=>r.id===base.employeeId)
  assert.equal(row.net,285);assert.equal(row.early,1);assert.equal(row.core,2);assert.equal(row.late,1);assert.equal(row.weekend,0)
  assert.equal(report.totals.net,375);assert.equal(report.totals.core,3);assert.equal(JSON.stringify(data),frozen)
  assert.equal(sortReport(report.rows,'net')[0].id,base.employeeId);assert.notEqual(sortReport(report.rows,'net'),report.rows)
})
test('Bestehende Zeitgrenzen gelten exakt; fehlende Pausen erzeugen keine Standardpause',()=>{
  const data=fixture(),base=data.shifts[0];data.absences=[]
  data.shifts=[shifted(base,'early',date,'07:00','08:00'),shifted(base,'core',date,'08:00','15:00'),shifted(base,'late',date,'15:00','16:00')];delete data.shifts[1].breakMinutes
  const row=analyticsReport(data,'week',date).rows.find(r=>r.id===base.employeeId)
  assert.deepEqual([row.early,row.core,row.late],[1,1,1]);assert.equal(row.net,540);assert.equal(row.missingBreak,true)
})
test('Nur tatsächlich gespeicherte Wochenenddienste zählen; mehrere Teile am Sonntag bleiben ein Diensttag',()=>{
  const data=fixture(),base=data.shifts[0]
  assert.equal(analyticsReport(data,'week',date).totals.weekend,0)
  data.shifts=[shifted(base,'sat','2027-01-09','10:00','11:00'),shifted(base,'sun-a','2027-01-10','10:00','11:00'),shifted(base,'sun-b','2027-01-10','12:00','14:00',15)]
  const row=analyticsReport(data,'week',date).rows.find(r=>r.id===base.employeeId)
  assert.equal(row.weekend,2);assert.equal(row.net,225);assert.deepEqual([row.early,row.core,row.late],[0,0,0])
})
test('ISO-Wochen, Monatsgrenzen und Vor/Zurück nutzen vorhandene Kalenderhelfer, ohne Monats-Sollwerte zu erzeugen',()=>{
  assert.deepEqual(reportRange('week','2027-01-01'),{from:'2026-12-28',to:'2027-01-03'})
  assert.equal(reportRange('month','2024-02-20').to,'2024-02-29');assert.equal(moveReport('month','2027-01-31',1),'2027-02-01');assert.equal(moveReport('week',date,-1),'2026-12-28')
  assert.throws(()=>moveReport('month','9998-12-01',1))
  const data=fixture(),base=data.shifts[0];data.shifts=['2026-12-31','2027-01-01','2027-01-31','2027-02-01'].map((day,index)=>shifted(base,`boundary-${index}`,day,'10:00','11:00',15))
  assert.equal(analyticsReport(data,'month','2027-01-31').totals.net,90);assert.equal(analyticsReport(data,'week','2027-01-01').totals.net,90)
  assert.equal(analyticsReport(data,'month','2027-02-01').totals.net,45)
  const row=analyticsReport(data,'month',date).rows.find(r=>r.id===base.employeeId);assert.equal(row.contract,data.employees.find(p=>p.id===base.employeeId).weeklyMinutes);assert.ok(!Object.hasOwn(row,'overtime'))
})
test('Stammgruppenfilter 3/4/4, Auswahl-Summen, historische Personen und leere Zeiträume bleiben nachvollziehbar',()=>{
  const data=fixture(),all=analyticsReport(data,'week',date);assert.equal(all.rows.length,11);assert.equal(all.totals.net,333*60)
  for(const [index,count,hours] of [[0,3,90.5],[1,4,116],[2,4,126.5]]){const report=analyticsReport(data,'week',date,data.setup.groups[index].id);assert.equal(report.rows.length,count);assert.equal(report.totals.net,hours*60)}
  data.shifts.push({...data.shifts[0],id:'historical',employeeId:'removed',employeeName:'Historischer Name',groupId:'demo-group-0'})
  const old=analyticsReport(data,'week',date).rows.find(row=>row.id==='removed');assert.equal(old.historical,true);assert.equal(old.contract,null);assert.equal(old.name,'Historischer Name')
  const empty=analyticsReport(data,'week','2027-03-01');assert.equal(empty.empty,true);assert.equal(empty.totals.net,0);assert.equal(empty.rows.length,11);assert.ok(empty.rows.every(row=>!row.planned))
})
test('Unbekannte Daten werden nicht als Null/Fairness ausgegeben; fehlende Konfiguration lässt verlässliche Stunden/Wochenenden lesbar',()=>{
  const data=fixture();data.setup=null
  const report=analyticsReport(data,'week',date);assert.equal(report.totals.early,null);assert.equal(report.totals.core,null);assert.equal(report.totals.late,null);assert.equal(report.totals.net,333*60);assert.equal(report.warningsAvailable,false)
  const source=payloadStorage(buildDemo(date).payload),reads={getItem(key){if(key===SHIFTS_KEY)throw Error('blocked');return source.getItem(key)},setItem(){assert.fail('read-only')}}
  const missing=readAnalyticsData(reads),unknown=analyticsReport(missing,'week',date);assert.ok(missing.errors.length);assert.equal(unknown.totals.net,null);assert.equal(unknown.totals.weekend,null);assert.equal(unknown.empty,false);assert.equal(unknown.warningsAvailable,false)
})
test('Verteilungshinweise verwenden Teilzeit/Verfügbarkeit/Abwesenheit und nur vollständige Wochen; kein Fairness-Score',()=>{
  const data=fixture(),base=data.shifts.find(s=>s.employeeId==='demo-person-0');data.employees=data.employees.filter(p=>['demo-person-0','demo-person-1'].includes(p.id));data.employees[1]={...data.employees[1],weeklyMinutes:1500};data.absences=[]
  data.shifts=['04','05','06','07','08'].map((day,index)=>shifted(base,`early-${index}`,`2027-01-${day}`,'07:00','08:00'))
  assert.ok(analyticsReport(data,'week',date).warnings.length>0)
  const b=data.employees[1],shiftB={...base,employeeId:b.id,employeeName:b.name};data.shifts.push(...['04','05','06'].map((day,index)=>shifted(shiftB,`part-${index}`,`2027-01-${day}`,'07:00','08:00')))
  assert.equal(analyticsReport(data,'week',date).warnings.length,0)
  data.shifts=data.shifts.filter(s=>s.employeeId===base.employeeId);data.absences=[{id:'away',employeeId:b.id,employeeName:b.name,type:'vacation',startDate:'2027-01-05',endDate:'2027-01-05',portion:'full'}]
  assert.equal(analyticsReport(data,'week',date).warnings.length,0)
  data.absences=[];data.employees[1]={...b,availability:{start:'09:00',end:'16:00'}};assert.equal(analyticsReport(data,'week',date).warnings.length,0)
  data.employees[1]=b;data.shifts=['01','02','03'].map((day,index)=>shifted(base,`partial-${index}`,`2027-09-${day}`,'07:00','08:00'))
  assert.ok(analyticsReport(data,'week','2027-09-01').warnings.length>0);const month=analyticsReport(data,'month','2027-09-01');assert.equal(month.warnings.length,0);assert.equal(month.rows.find(r=>r.id===base.employeeId).early,3);assert.ok(!Object.hasOwn(month,'score'))
})
test('Auswertungsseite rendert mobile Karten für alle elf Personen und schreibt beim Lesen keinerlei App-Daten',async()=>{
  const {AnalyticsPage}=await bundle('src/modules/auswertungen/AnalyticsPage.tsx',true),payload=buildDemo(localDate()).payload,values=new Map(Object.entries(payload).map(([key,value])=>[key,JSON.stringify(value)])),oldWindow=globalThis.window
  const before=[...values];let writes=0;globalThis.window={localStorage:{getItem:key=>values.get(key)??null,setItem(){writes++;assert.fail('read-only')},removeItem(){writes++;assert.fail('read-only')}}}
  try{const html=renderToStaticMarkup(createElement(AnalyticsPage));assert.equal((html.match(/class="analytics-person"/g)??[]).length,11);assert.match(html,/333:00/);assert.match(html,/Früh/);assert.match(html,/Spät/);assert.match(html,/Wochenende/);assert.match(html,/Sortieren nach/);assert.match(html,/Kalendermonat/);assert.equal(writes,0);assert.deepEqual([...values],before)}finally{globalThis.window=oldWindow}
})
