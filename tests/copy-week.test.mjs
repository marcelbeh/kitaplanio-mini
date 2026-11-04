import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
async function bundle(path){const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`)}
const {prepareWeekCopy,adoptWeekCopy}=await bundle('src/modules/dienstplan/copyWeek.ts')
const {buildDemo}=await bundle('src/modules/einstellungen/demo.ts')
const {readGeneratorContext}=await bundle('src/modules/dienstplan/generator.ts')
const {teamPlan,PUBLICATIONS_KEY}=await bundle('src/modules/dienstplan/publications.ts')
const {loadShifts,SHIFTS_KEY,calendarWeek}=await bundle('src/modules/dienstplan/schedule.ts')
const {ABSENCES_KEY}=await bundle('src/modules/abwesenheiten/absences.ts')
const {EVENTS_KEY,newEvent}=await bundle('src/modules/termine/events.ts')
const {ACTIVE_KEY}=await bundle('src/cloud/workspace.ts')
const source='2027-01-04',target='2027-01-11'
function memory(date=source){const data=buildDemo(date).payload,values=new Map(Object.entries(data).map(([key,value])=>[key,JSON.stringify(value)])),writes=[];return{values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(key);values.set(key,value)}}}
let previewSerial=0
function preview(s,from=source,to=target){let index=0;const prefix=previewSerial++;return prepareWeekCopy(s,from,to,()=>`copy-${prefix}-${index++}`)}
function writeShifts(s,shifts){s.values.set(SHIFTS_KEY,JSON.stringify({version:1,shifts}))}
function publishFixture(s,date){const plan={...teamPlan(readGeneratorContext(s),date),version:1,publishedAt:'2027-01-01T12:00:00Z'};s.values.set(PUBLICATIONS_KEY,JSON.stringify({version:1,plans:[plan]}));return s.getItem(PUBLICATIONS_KEY)}

test('P10: Vorschau schreibt nichts, übernimmt 53 Schichten mit neuen IDs, gleichen Wochentagen/Zeiten/Pausen und nur einem Speichervorgang',()=>{
  const s=memory(),before=new Map(s.values),old=loadShifts(s),p=preview(s)
  assert.equal(p.shifts.length,53);assert.equal(p.skipped.length,0);assert.equal(s.writes.length,0)
  assert.deepEqual(s.values,before);assert.throws(()=>adoptWeekCopy(s,p,false),/bestätigen/)
  for(const shift of p.shifts){const original=old.find(item=>p.ids[item.id]===shift.id);assert.ok(original);assert.equal(new Date(shift.date).getUTCDay(),new Date(original.date).getUTCDay());assert.equal(shift.start,original.start);assert.equal(shift.end,original.end);assert.equal(shift.breakMinutes,original.breakMinutes);assert.equal(shift.employeeId,original.employeeId);assert.equal(shift.groupId,original.groupId)}
  assert.equal(adoptWeekCopy(s,p,true),53);assert.deepEqual(s.writes,[SHIFTS_KEY]);assert.equal(loadShifts(s).length,106)
  for(const key of before.keys())if(key!==SHIFTS_KEY)assert.equal(s.getItem(key),before.get(key))
  for(const shift of old)assert.deepEqual(loadShifts(s).find(item=>item.id===shift.id),shift)
  const again=preview(s);assert.equal(again.shifts.length,0);assert.equal(again.skipped.length,53);assert.throws(()=>adoptWeekCopy(s,again,true),/Keine/)
})
test('Vorhandene Zielschichten bleiben unverändert; Überschneidungen werden konkret übersprungen',()=>{
  const s=memory(),base=loadShifts(s).find(x=>x.employeeId==='demo-person-0'&&x.date===source),existing={...base,id:'existing',date:target,start:'07:30',end:'08:30',breakMinutes:0,annotation:'keep'}
  writeShifts(s,[...loadShifts(s),existing]);const p=preview(s)
  assert.ok(p.skipped.some(x=>x.source.id===base.id&&x.reasons.some(r=>r.includes('Überschneidung'))));assert.equal(p.shifts.length,52)
  adoptWeekCopy(s,p,true);assert.deepEqual(loadShifts(s).find(x=>x.id==='existing'),existing)
})
test('Ziel-Abwesenheiten einschließlich ungeklärter Halbtage und wiederkehrende Sondertermine werden nicht ungefragt übernommen',()=>{
  const s=memory()
  const absence=(id,employeeId,date,portion)=>({id,employeeId,employeeName:'DEMO',type:'vacation',startDate:date,endDate:date,portion})
  s.values.set(ABSENCES_KEY,JSON.stringify({version:1,absences:[absence('full','demo-person-0','2027-01-13','full'),absence('half','demo-person-2',target,'am')]}))
  s.values.set(EVENTS_KEY,JSON.stringify({version:1,events:[{...newEvent('recurring'),title:'Ziel-Fortbildung',type:'training',date:'2027-01-08',start:'09:00',end:'10:00',recurrence:'weekly',until:'2027-01-22',groupIds:['demo-group-1']}]}))
  const before=new Map(s.values),p=preview(s)
  assert.ok(!p.shifts.some(x=>x.employeeId==='demo-person-0'&&x.date==='2027-01-13'));assert.ok(!p.shifts.some(x=>x.employeeId==='demo-person-2'&&x.date===target))
  assert.ok(p.skipped.some(x=>x.reasons.some(r=>r.includes('halbtags'))));assert.ok(p.skipped.some(x=>x.reasons.some(r=>r.includes('Ziel-Fortbildung'))))
  adoptWeekCopy(s,p,true);assert.equal(s.getItem(ABSENCES_KEY),before.get(ABSENCES_KEY));assert.equal(s.getItem(EVENTS_KEY),before.get(EVENTS_KEY))
})
test('Keine Wochenendplanung aus einem Termin; echte Samstag-/Sonntagschichten werden über Jahresgrenzen inklusive Pausen übertragen',()=>{
  const s=memory('2027-01-01'),from='2026-12-28',to='2027-01-04',base=loadShifts(s)[0]
  assert.ok(!preview(s,from,to).shifts.some(x=>new Date(x.date).getUTCDay()%6===0))
  writeShifts(s,[...loadShifts(s),{...base,id:'sat',date:'2027-01-02',start:'10:00',end:'12:00',breakMinutes:15},{...base,id:'sun',date:'2027-01-03',start:'10:00',end:'11:00',breakMinutes:0}])
  const p=preview(s,from,to);assert.ok(p.shifts.some(x=>x.date==='2027-01-09'&&x.breakMinutes===15));assert.ok(p.shifts.some(x=>x.date==='2027-01-10'&&x.breakMinutes===0))
  assert.ok(p.issues.some(x=>x.cause.includes('Wochenend')));adoptWeekCopy(s,p,true)
  assert.deepEqual(calendarWeek(to).days.slice(5),['2027-01-09','2027-01-10'])
})
test('Veröffentlichte Zielwoche gesperrt; Quell-Snapshot bleibt bytegenau erhalten; neue Freigabe nach Vorschau verhindert Speichern',()=>{
  const s=memory(),published=publishFixture(s,source),p=preview(s);adoptWeekCopy(s,p,true);assert.equal(s.getItem(PUBLICATIONS_KEY),published)
  const t=memory();publishFixture(t,target);const before=new Map(t.values);assert.throws(()=>preview(t),/veröffentlicht/);assert.deepEqual(t.values,before)
  const u=memory(),pending=preview(u);publishFixture(u,target);const unchanged=new Map(u.values)
  assert.throws(()=>adoptWeekCopy(u,pending,true),/inzwischen geändert/);assert.deepEqual(u.values,unchanged)
})
test('Veraltete/abgeänderte Vorschau, Arbeitsbereichswechsel, ungültige Wochen/IDs und Schreibfehler speichern keine Teilkopie',()=>{
  assert.throws(()=>preview(memory(),source,source),/unterschiedlich/)
  assert.throws(()=>prepareWeekCopy(memory(),source,target,()=> 'same-id'),/eindeutige/)
  const s=memory(),p=preview(s);p.shifts[0].start='06:00';const before=new Map(s.values)
  assert.throws(()=>adoptWeekCopy(s,p,true),/Vorschau/);assert.deepEqual(s.values,before)
  const t=memory(),pending=preview(t);t.values.set(ACTIVE_KEY,'changed');const tBefore=new Map(t.values)
  assert.throws(()=>adoptWeekCopy(t,pending,true),/inzwischen geändert/);assert.deepEqual(t.values,tBefore)
  const u=memory(),stale=preview(u);writeShifts(u,loadShifts(u).slice(1));const uBefore=new Map(u.values)
  assert.throws(()=>adoptWeekCopy(u,stale,true),/inzwischen geändert/);assert.deepEqual(u.values,uBefore)
  const v=memory(),copy=preview(v),vBefore=new Map(v.values);v.setItem=()=>{throw Error('quota')}
  assert.throws(()=>adoptWeekCopy(v,copy,true),/quota/);assert.deepEqual(v.values,vBefore)
})
test('Bestehende Verfügbarkeits-/Grenzprüfungen gelten auch für Kopien; geteilte Dienste mit festen Tageszeiten bleiben kopierbar',()=>{
  const s=memory(),data=readGeneratorContext(s),base=data.shifts.find(x=>x.employeeId==='demo-person-0'&&x.date===source)
  const person={...data.employees.find(x=>x.id===base.employeeId),fixedTimes:{mon:{start:'07:00',end:'15:00'}}}
  s.values.set('kitaplanio-lite:employees:v1',JSON.stringify({version:1,employees:[...data.employees.filter(x=>x.id!==person.id),person]}))
  writeShifts(s,[{...base,id:'split-a',end:'11:00',breakMinutes:0},{...base,id:'split-b',start:'11:00',breakMinutes:0}])
  const valid=preview(s);assert.equal(valid.shifts.length,2);assert.equal(valid.skipped.length,0)
  s.values.set('kitaplanio-lite:employees:v1',JSON.stringify({version:1,employees:[{...person,fixedTimes:{},availability:{start:'08:00',end:'16:00'}}]}))
  const blocked=preview(s);assert.ok(blocked.skipped.some(x=>x.reasons.some(r=>r.includes('Arbeitsrahmen'))))
  const setup={...data.setup,planningRules:{maxShiftMinutes:60}};s.values.set('kitaplanio-lite:kita:v1',JSON.stringify(setup))
  assert.equal(preview(s).shifts.length,0)
})
