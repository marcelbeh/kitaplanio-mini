import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
async function bundle(path){const r=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'});return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`)}
const {TEMPLATES_KEY,loadTemplates,saveWeekTemplate,renameTemplate,deleteTemplate,prepareTemplate,applyTemplate}=await bundle('src/modules/dienstplan/templates.ts')
const {buildDemo}=await bundle('src/modules/einstellungen/demo.ts')
const {loadShifts,SHIFTS_KEY}=await bundle('src/modules/dienstplan/schedule.ts')
const {readGeneratorContext}=await bundle('src/modules/dienstplan/generator.ts')
const {teamPlan,PUBLICATIONS_KEY}=await bundle('src/modules/dienstplan/publications.ts')
const {ACTIVE_KEY,createAppStorage,CACHE_PREFIX}=await bundle('src/cloud/workspace.ts')
const {openWorkspace}=await bundle('src/cloud/sync.ts')
const {AREAS}=await bundle('src/cloud/dataset.ts')
const source='2027-01-04',target='2027-01-11'
function memory(demo=true){const values=new Map(demo?Object.entries(buildDemo(source).payload).map(([key,value])=>[key,JSON.stringify(value)]):[]),writes=[];return{values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(key);values.set(key,value)},removeItem:key=>values.delete(key)}}
function saved(s){return saveWeekTemplate(s,s,source,'Reguläre Woche',true,'template-a').templates[0]}
function publication(s,date){s.values.set(PUBLICATIONS_KEY,JSON.stringify({version:1,plans:[{...teamPlan(readGeneratorContext(s),date),version:1,publishedAt:'2027-01-01T12:00:00Z'}]}))}

test('Benanntes Wochenmuster bleibt nach Neuladen erhalten, enthält nur undatierte erlaubte Felder und verändert keinen Arbeitsplan',()=>{
  const s=memory(),before=new Map(s.values)
  assert.throws(()=>saveWeekTemplate(s,s,source,'Woche',false),/bestätigen/);assert.equal(s.getItem(TEMPLATES_KEY),null)
  const template=saved(s);assert.equal(template.entries.length,53)
  assert.deepEqual(loadTemplates({getItem:key=>s.getItem(key)}).templates,[template])
  assert.deepEqual(Object.keys(template),['id','name','entries'])
  for(const entry of template.entries){assert.ok(Object.keys(entry).every(key=>['employeeId','groupId','weekday','start','end','breakMinutes'].includes(key)));assert.ok(entry.weekday>=0&&entry.weekday<=6)}
  assert.ok(!s.getItem(TEMPLATES_KEY).includes('2027-'));assert.ok(!s.getItem(TEMPLATES_KEY).includes('publishedAt'))
  assert.deepEqual(s.writes,[TEMPLATES_KEY]);for(const [key,value]of before)assert.equal(s.getItem(key),value)
})
test('Umbenennen und Löschen brauchen ausdrückliche Aktion; alte Bearbeitungsstände löschen/überschreiben keine neuere Vorlage',()=>{
  const s=memory(),original=saved(s)
  assert.throws(()=>renameTemplate(s,original,'Neu',false),/bestätigen/)
  const renamed=renameTemplate(s,original,'  Frühwoche  ',true).templates[0];assert.equal(renamed.name,'Frühwoche');assert.deepEqual(renamed.entries,original.entries)
  const before=s.getItem(TEMPLATES_KEY);assert.throws(()=>deleteTemplate(s,original,true),/inzwischen/);assert.equal(s.getItem(TEMPLATES_KEY),before)
  assert.throws(()=>deleteTemplate(s,renamed,false),/bestätigen/);assert.equal(s.getItem(TEMPLATES_KEY),before)
  assert.deepEqual(deleteTemplate(s,renamed,true),{version:1,templates:[]})
})
test('P12-Vorschau und atomare Übernahme: Zielschichten bleiben erhalten, keine Quell-Pseudowoche wird gespeichert',()=>{
  const s=memory(),template=saved(s),base=loadShifts(s).find(x=>x.employeeId==='demo-person-0'&&x.date===source),existing={...base,id:'existing',date:target}
  s.values.set(SHIFTS_KEY,JSON.stringify({version:1,shifts:[...loadShifts(s),existing]}));const original=loadShifts(s),pattern=s.getItem(TEMPLATES_KEY)
  const preview=prepareTemplate(s,s,template.id,target);assert.equal(preview.copy.shifts.length,52);assert.equal(preview.copy.skipped.length,1)
  const before=new Map(s.values);assert.throws(()=>applyTemplate(s,s,preview,false),/bestätigen/);assert.deepEqual(s.values,before)
  s.writes.length=0;assert.equal(applyTemplate(s,s,preview,true),52);assert.deepEqual(s.writes,[SHIFTS_KEY]);assert.equal(s.getItem(TEMPLATES_KEY),pattern)
  const shifts=loadShifts(s);assert.equal(shifts.length,original.length+52)
  for(const shift of original)assert.deepEqual(shifts.find(item=>item.id===shift.id),shift)
  assert.ok(!shifts.some(shift=>shift.id.startsWith('pattern-')))
  const again=prepareTemplate(s,s,template.id,target);assert.equal(again.copy.shifts.length,0)
})
test('Abwesenheiten, Ziel-Sondertermine und fehlende Zuordnungen werden unverändert durch P12 übersprungen; veröffentlichte Ziele sind gesperrt',()=>{
  const s=memory(),template=saved(s)
  s.values.set('kitaplanio-lite:absences:v1',JSON.stringify({version:1,absences:[{id:'away',employeeId:'demo-person-0',employeeName:'DEMO',startDate:target,endDate:target,type:'vacation',portion:'full'}]}))
  s.values.set('kitaplanio-lite:events:v1',JSON.stringify({version:1,events:[{id:'event',title:'Zieltermin',date:'2027-01-12',start:'09:00',end:'10:00',type:'meeting',note:'',wholeTeam:false,employeeIds:['demo-person-2'],groupIds:[],recurrence:'once',until:''}]}))
  let preview=prepareTemplate(s,s,template.id,target);assert.ok(preview.copy.skipped.some(x=>x.reasons.some(r=>r.includes('Urlaub'))));assert.ok(preview.copy.skipped.some(x=>x.reasons.some(r=>r.includes('Zieltermin'))))
  const people=JSON.parse(s.getItem('kitaplanio-lite:employees:v1'));people.employees=people.employees.filter(p=>p.id!=='demo-person-1');s.values.set('kitaplanio-lite:employees:v1',JSON.stringify(people))
  preview=prepareTemplate(s,s,template.id,target);assert.ok(preview.copy.skipped.some(x=>x.reasons.some(r=>r.includes('nicht mehr im Team'))))
  publication(s,target);const before=new Map(s.values);assert.throws(()=>prepareTemplate(s,s,template.id,target),/veröffentlicht/);assert.deepEqual(s.values,before)
})
test('Nur tatsächliche Wochenenddienste werden Teil der Vorlage; Anwenden in derselben Quellwoche erzeugt keine Duplikate',()=>{
  const s=memory(),base=loadShifts(s)[0]
  s.values.set(SHIFTS_KEY,JSON.stringify({version:1,shifts:[...loadShifts(s),{...base,id:'weekend',date:'2027-01-09',start:'10:00',end:'12:00',breakMinutes:15}]}))
  const template=saved(s);assert.equal(template.entries.filter(x=>x.weekday>=5).length,1)
  const same=prepareTemplate(s,s,template.id,source);assert.equal(same.copy.shifts.length,0)
  const preview=prepareTemplate(s,s,template.id,target);assert.ok(preview.copy.shifts.some(x=>x.date==='2027-01-16'&&x.breakMinutes===15));assert.ok(!preview.copy.shifts.some(x=>x.date==='2027-01-17'))
  applyTemplate(s,s,preview,true)
})
test('Vorlagen sind auch im Cloud-Arbeitsbereich nur lokal; Anwendung nutzt den unveränderten atomaren Workspace-Adapter',()=>{
  const s=memory(),owner='00000000-0000-4000-8000-000000000001',payload=buildDemo(source).payload,originals=AREAS.map(key=>s.getItem(key))
  openWorkspace(s,owner,{revision:1,payload,updatedAt:null},true)
  const plan=createAppStorage(s),cacheBefore=s.getItem(CACHE_PREFIX+owner);s.writes.length=0
  const template=saveWeekTemplate(s,plan,source,'Lokal bei Cloud',true,'cloud-local').templates[0]
  assert.deepEqual(s.writes,[TEMPLATES_KEY]);assert.ok(s.getItem(TEMPLATES_KEY));assert.equal(s.getItem(CACHE_PREFIX+owner),cacheBefore)
  const preview=prepareTemplate(s,plan,template.id,target);s.writes.length=0
  applyTemplate(s,plan,preview,true);assert.deepEqual(s.writes,[CACHE_PREFIX+owner]);assert.deepEqual(AREAS.map(key=>s.getItem(key)),originals)
  const cache=JSON.parse(s.getItem(CACHE_PREFIX+owner));assert.ok(!Object.hasOwn(cache.local,TEMPLATES_KEY));assert.ok(!Object.hasOwn(cache.base,TEMPLATES_KEY));assert.equal(s.getItem(ACTIVE_KEY),owner)
})
test('Beschädigte Daten, veraltete Vorlage/Plan, abgeänderte Vorschau und Schreibfehler behalten bestehende Daten vollständig',()=>{
  const corrupt=memory();corrupt.values.set(TEMPLATES_KEY,'{"version":2,"templates":[]}');assert.throws(()=>loadTemplates(corrupt),/nicht überschrieben/)
  assert.throws(()=>saved(corrupt));assert.equal(corrupt.getItem(TEMPLATES_KEY),'{"version":2,"templates":[]}')
  const s=memory(),template=saved(s),preview=prepareTemplate(s,s,template.id,target);renameTemplate(s,template,'Neu',true);const before=new Map(s.values)
  assert.throws(()=>applyTemplate(s,s,preview,true),/inzwischen geändert/);assert.deepEqual(s.values,before)
  const t=memory(),item=saved(t),changed=prepareTemplate(t,t,item.id,target);changed.copy.pattern[0].start='06:00';assert.throws(()=>applyTemplate(t,t,changed,true),/inzwischen geändert/)
  const v=memory(),record=saved(v),pending=prepareTemplate(v,v,record.id,target),old=new Map(v.values);v.setItem=()=>{throw Error('quota')}
  assert.throws(()=>applyTemplate(v,v,pending,true),/quota/);assert.deepEqual(v.values,old)
  assert.throws(()=>renameTemplate(v,record,'Name',true),/quota/);assert.deepEqual(v.values,old)
  assert.throws(()=>saveWeekTemplate(v,v,source,'Neu',true,'new-template'),/quota/);assert.deepEqual(v.values,old)
  const w=memory(),pattern=saved(w),stale=prepareTemplate(w,w,pattern.id,target);publication(w,target);assert.throws(()=>applyTemplate(w,w,stale,true),/inzwischen geändert/)
})
