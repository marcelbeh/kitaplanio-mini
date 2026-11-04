import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function bundle(path) {
  const result = await build({ entryPoints: [path], bundle:true,write:false,format:'esm',platform:'node' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const { synchronize, resolveConflict, openWorkspace, supabaseRemote } = await bundle('src/cloud/sync.ts')
const { createAppStorage, readWorkspace, ACTIVE_KEY, CACHE_PREFIX, isDirty } = await bundle('src/cloud/workspace.ts')
const { AREAS, equal, validatePayload } = await bundle('src/cloud/dataset.ts')
const owner = '00000000-0000-4000-8000-000000000001', shifts = 'kitaplanio-lite:shifts:v1', events = 'kitaplanio-lite:events:v1', pubs = 'caro:published-weeks:v1'
const empty = () => Object.fromEntries(AREAS.map(key => [key,null]))
const clone = value => JSON.parse(JSON.stringify(value))
function memory() {
  const values = new Map(), writes=[]
  return { values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(key);values.set(key,value)},removeItem(key){values.delete(key)} }
}
function server(payload = empty()) {
  let record={revision:0,payload:clone(payload),updatedAt:null}, calls=0
  return { read:async()=>clone(record),cas:async(revision,payload)=>{
    calls++; if(revision!==record.revision)return null
    record={revision:revision+1,payload:clone(payload),updatedAt:new Date().toISOString()};return clone(record)
  },get calls(){return calls} }
}
async function device(remote) { const storage=memory();openWorkspace(storage,owner,await remote.read(),true);return storage }
const collection = () => ({version:1,shifts:[{id:'s',employeeId:'e',groupId:'g',date:'2027-01-09',start:'09:00',end:'10:00',breakMinutes:0}]})

test('Legacy-Daten werden weder initialisiert noch hochgeladen; Öffnen braucht Bestätigung und nutzt getrennten Cache',async()=>{
  const storage=memory(), remote=server();storage.setItem(shifts,'legacy unchanged')
  assert.throws(()=>openWorkspace(storage,owner,{revision:0,payload:empty()},false),/bestätigen/)
  assert.equal(storage.getItem(ACTIVE_KEY),null)
  openWorkspace(storage,owner,await remote.read(),true)
  const app=createAppStorage(storage);app.setItem(shifts,JSON.stringify(collection()))
  assert.equal(storage.getItem(shifts),'legacy unchanged');assert.ok(isDirty(readWorkspace(storage)))
  storage.removeItem(ACTIVE_KEY)
  assert.equal(app.getItem(shifts),'legacy unchanged');assert.ok(storage.getItem(CACHE_PREFIX+owner))
  openWorkspace(storage,owner,await remote.read(),true)
  assert.deepEqual(JSON.parse(app.getItem(shifts)),collection());assert.equal(remote.calls,0)
})
test('Zwei Geräte: Änderungen, leere Sammlungen und Löschungen werden nach manueller Wahl exakt übertragen',async()=>{
  const remote=server(),a=await device(remote),b=await device(remote),app=createAppStorage(a)
  app.setItem(shifts,JSON.stringify(collection()))
  assert.equal((await synchronize(a,owner,remote)).kind,'synced')
  let result=await synchronize(b,owner,remote);assert.equal(result.kind,'conflict')
  assert.equal(readWorkspace(b).local[shifts],null)
  await assert.rejects(resolveConflict(b,owner,remote,result.conflict,'cloud',false),/bestätigen/)
  await resolveConflict(b,owner,remote,result.conflict,'cloud',true)
  assert.deepEqual(readWorkspace(b).local[shifts],collection())
  app.setItem(shifts,JSON.stringify({version:1,shifts:[]}));app.removeItem(events)
  await synchronize(a,owner,remote)
  result=await synchronize(b,owner,remote);await resolveConflict(b,owner,remote,result.conflict,'cloud',true)
  assert.deepEqual(readWorkspace(b).local[shifts],{version:1,shifts:[]});assert.equal(readWorkspace(b).local[events],null)
})
test('Gleichzeitige Änderungen: CAS blockiert veraltete Writes, erneute Cloud-Änderung erfordert neue Bestätigung',async()=>{
  const remote=server(),a=await device(remote),b=await device(remote)
  createAppStorage(a).setItem(shifts,JSON.stringify(collection()))
  createAppStorage(b).setItem(shifts,JSON.stringify({version:1,shifts:[]}))
  const results=await Promise.all([synchronize(a,owner,remote),synchronize(b,owner,remote)])
  assert.equal(results.filter(r=>r.kind==='conflict').length,1)
  let result=results[1];assert.equal(result.kind,'conflict')
  const original=clone(readWorkspace(b).local)
  const advanced=await remote.read();await remote.cas(advanced.revision,advanced.payload)
  result=await resolveConflict(b,owner,remote,result.conflict,'local',true)
  assert.equal(result.kind,'conflict');assert.deepEqual(readWorkspace(b).local,original)
  assert.equal((await resolveConflict(b,owner,remote,result.conflict,'local',true)).kind,'synced')
  assert.deepEqual((await remote.read()).payload,original)
})
test('Offline/Quota/Logout: keine teilweise Übernahme; lokale Änderungen während Upload bleiben erhalten',async()=>{
  const remote=server(),storage=await device(remote),app=createAppStorage(storage)
  app.setItem(shifts,JSON.stringify(collection()));const before=storage.getItem(CACHE_PREFIX+owner)
  await assert.rejects(synchronize(storage,owner,{read:async()=>{throw Error('offline')}}),/offline/)
  assert.equal(storage.getItem(CACHE_PREFIX+owner),before)
  const delayed={read:remote.read,cas:async(...args)=>{app.setItem(shifts,JSON.stringify({version:1,shifts:[]}));return remote.cas(...args)}}
  await synchronize(storage,owner,delayed);assert.ok(isDirty(readWorkspace(storage)))
  assert.deepEqual(readWorkspace(storage).local[shifts],{version:1,shifts:[]})
  const result=await synchronize(storage,owner,{read:async()=>({revision:4,payload:empty(),updatedAt:null})})
  const saved=storage.getItem(CACHE_PREFIX+owner), originalSet=storage.setItem
  storage.setItem=()=>{throw Error('quota')}
  await assert.rejects(resolveConflict(storage,owner,{read:async()=>result.conflict.remote},result.conflict,'cloud',true),/quota/)
  assert.equal(storage.getItem(CACHE_PREFIX+owner),saved);storage.setItem=originalSet
  const loggedOut={read:remote.read,cas:async(...args)=>{storage.removeItem(ACTIVE_KEY);return remote.cas(...args)}}
  await assert.rejects(synchronize(storage,owner,loggedOut),/gewechselt/)
  assert.equal(storage.getItem(CACHE_PREFIX+owner),saved)
})
test('Unveränderliche Freigaben werden auch bei Cloud-Übernahme geschützt; JSONB-Schlüsselreihenfolge erzeugt keinen Konflikt',async()=>{
  const plan={kitaName:'caro.',from:'2027-01-04',to:'2027-01-10',week:1,year:2027,employees:[],groups:[],shifts:[],version:1,publishedAt:'2027-01-01T12:00:00Z'}
  const payload={...empty(),[pubs]:{version:1,plans:[plan]}}, remote=server(payload),storage=await device(remote)
  assert.throws(()=>createAppStorage(storage).removeItem(pubs),/Wochenversionen/)
  const result=await synchronize(storage,owner,{read:async()=>({revision:1,payload:empty(),updatedAt:null})})
  await assert.rejects(resolveConflict(storage,owner,{read:async()=>result.conflict.remote},result.conflict,'cloud',true),/Wochenversionen/)
  assert.ok(equal(payload,Object.fromEntries(Object.entries(payload).reverse())))
  assert.throws(()=>validatePayload({}),/unvollständig/)
})
test('Nicht eingerichtete Bestände werden nicht initialisiert; Auth-Fehler lassen keinen RPC zu',async()=>{
  let calls=0
  const query={select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}}
  const client={auth:{getUser:async()=>({data:{user:{id:owner}}})},from(table){return table==='caro_members'?{...query,async maybeSingle(){return {data:{user_id:owner},error:null}}}:query},rpc(){calls++;throw Error('should not run')}}
  await assert.rejects(supabaseRemote(client,owner).read(),/P8c/)
  const foreign=supabaseRemote(client,'00000000-0000-4000-8000-000000000002')
  await assert.rejects(foreign.cas(0,empty()),/Sitzung/);assert.equal(calls,0)
})
