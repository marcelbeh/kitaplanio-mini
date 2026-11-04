import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function bundle(path) {
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'})
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const {makeBackup,readBackup,verifyBackupFile,firstImport,importPayload,areaPreview,downloadBackup}=await bundle('src/cloud/firstImport.ts')
const {supabaseRemote,openWorkspace}=await bundle('src/cloud/sync.ts')
const {AREAS}=await bundle('src/cloud/dataset.ts')
const {ACTIVE_KEY,CACHE_PREFIX,readWorkspace}=await bundle('src/cloud/workspace.ts')
const owner='00000000-0000-4000-8000-000000000001',token='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003'
const plan={kitaName:'caro.',from:'2027-01-04',to:'2027-01-10',week:1,year:2027,employees:[],groups:[],shifts:[],version:1,publishedAt:'2027-01-01T12:00:00Z'}
function memory() {
  const values=new Map([[AREAS[0],JSON.stringify({version:1,completed:true,name:'caro.',opening:{start:'07:00',end:'17:00'},early:{start:'07:00',end:'08:00',minimum:1},late:{start:'16:00',end:'17:00',minimum:1},groups:[{id:'g',name:'Sonne',periods:[{start:'08:00',end:'16:00',minimum:1}]}]})], [AREAS[2],'{ "version": 1, "employees": [] }'],[AREAS[6],JSON.stringify({version:1,plans:[plan]})]])
  return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
}
function remote(initial={kind:'empty'}) {
  let state=structuredClone(initial),writes=0
  return {inspect:async()=>structuredClone(state),initialize:async(payload,initializationId)=>{
    if(state.kind==='empty'){writes++;state={kind:'ready',initializationId,record:{revision:1,payload:structuredClone(payload),updatedAt:new Date().toISOString()}}}
  },get writes(){return writes}}
}
const backupOf=s=>makeBackup(s,owner,token)
const proofOf=(backup,s)=>verifyBackupFile(JSON.stringify(backup),backup,s)
const originals=s=>AREAS.map(key=>s.getItem(key))

test('Backup enthält alle Originalwerte bytegenau einschließlich null; tatsächliche gespeicherte Datei und Bestätigung sind Pflicht',async()=>{
  const s=memory(),backup=backupOf(s),server=remote(),raw=originals(s)
  assert.equal(backup.raw[AREAS[2]],'{ "version": 1, "employees": [] }')
  assert.equal(Object.keys(backup.raw).length,7);assert.equal(backup.raw[AREAS[3]],null)
  assert.throws(()=>readBackup(JSON.stringify(backup),other),/Konto/)
  const omitted=structuredClone(backup);delete omitted.raw[AREAS[3]]
  assert.throws(()=>readBackup(JSON.stringify(omitted),owner),/unvollständig/)
  assert.throws(()=>verifyBackupFile(JSON.stringify({...backup,version:2}),backup,s),/unbekannt/)
  await assert.rejects(firstImport(s,server,backup,null,true),/Sicherung/)
  await assert.rejects(firstImport(s,server,backup,proofOf(backup,s),false),/bestätigen/)
  assert.equal(server.writes,0);assert.deepEqual(originals(s),raw)
  const oldDoc=globalThis.document,oldWindow=globalThis.window,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  let blob,clicked=false,removed=false
  URL.createObjectURL=value=>{blob=value;return 'blob:test'};URL.revokeObjectURL=()=>{}
  globalThis.document={body:{append(){}},createElement:()=>({click(){clicked=true},remove(){removed=true}})}
  globalThis.window={setTimeout(fn){fn()}}
  try {downloadBackup(backup);assert.ok(clicked&&removed);assert.deepEqual(JSON.parse(await blob.text()),backup)}
  finally {globalThis.document=oldDoc;globalThis.window=oldWindow;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
})
test('Ungültige/unvollständige Daten blockieren, Roh-Backup bleibt möglich; optionale nicht vorhandene Bereiche werden sichtbar und unverändert erhalten',async()=>{
  const s=memory();assert.match(areaPreview(backupOf(s).raw)[3].detail,/Nicht vorhanden/)
  const corruptOptional=backupOf(s);corruptOptional.raw[AREAS[3]]='null';assert.throws(()=>importPayload(corruptOptional.raw),/beschädigt/)
  for(const invalid of ['{broken','{"version":9,"employees":[]}',null]){
    if(invalid===null)s.values.delete(AREAS[2]);else s.setItem(AREAS[2],invalid)
    const backup=backupOf(s),server=remote()
    assert.equal(backup.raw[AREAS[2]],invalid)
    await assert.rejects(firstImport(s,server,backup,proofOf(backup,s),true))
    assert.equal(server.writes,0);assert.equal(s.getItem(ACTIVE_KEY),null)
  }
})
test('Leere Cloud: genau ein atomarer Upload, vollständiges Rücklesen vor Aktivierung, Freigaben und lokale Originalwerte bleiben erhalten',async()=>{
  const s=memory(),raw=originals(s),backup=backupOf(s),server=remote()
  await firstImport(s,server,backup,proofOf(backup,s),true)
  assert.equal(server.writes,1);assert.equal(s.getItem(ACTIVE_KEY),owner);assert.deepEqual(originals(s),raw)
  assert.deepEqual(readWorkspace(s).local[AREAS[6]].plans,[plan]);assert.equal(readWorkspace(s).local[AREAS[3]],null)
  assert.deepEqual(readWorkspace(s).local,importPayload(backup.raw))
})
test('Befüllte oder bereits eingerichtete Cloud wird niemals überschrieben, auch bei identischen Daten mit anderer Kennung; zweites Gerät wechselt nur ausdrücklich',async()=>{
  for(const status of [{kind:'occupied'},{kind:'ready',initializationId:other,record:{revision:1,payload:importPayload(backupOf(memory()).raw),updatedAt:null}}]){
    const s=memory(),raw=originals(s),backup=backupOf(s),server=remote(status)
    await assert.rejects(firstImport(s,server,backup,proofOf(backup,s),true),/Cloud/)
    assert.equal(server.writes,0);assert.deepEqual(originals(s),raw);assert.equal(s.getItem(ACTIVE_KEY),null)
    if(status.kind==='ready'){
      assert.throws(()=>openWorkspace(s,owner,status.record,false),/bestätigen/)
      openWorkspace(s,owner,status.record,true);assert.deepEqual(originals(s),raw)
    }
  }
})
test('Parallele Erstübernahme: nur eine Kennung gewinnt, zweites Gerät aktiviert keinen fremden Erstübernahmeversuch',async()=>{
  const a=memory(),b=memory(),server=remote(),one=backupOf(a),two=makeBackup(b,owner,other)
  const result=await Promise.allSettled([firstImport(a,server,one,proofOf(one,a),true),firstImport(b,server,two,proofOf(two,b),true)])
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(server.writes,1)
  assert.equal(b.getItem(ACTIVE_KEY),null);assert.equal((await server.inspect()).initializationId,token)
})
test('Offline und verlorene Serverantwort: Originaldaten bleiben; Wiederaufnahme mit derselben Datei schreibt nicht erneut',async()=>{
  const s=memory(),raw=originals(s),backup=backupOf(s),proof=proofOf(backup,s),server=remote()
  await assert.rejects(firstImport(s,{inspect:async()=>{throw Error('offline')}},backup,proof,true),/offline/)
  const lost={inspect:server.inspect,initialize:async(...args)=>{await server.initialize(...args);throw Error('lost response')}}
  await assert.rejects(firstImport(s,lost,backup,proof,true),/lost response/)
  assert.equal(s.getItem(ACTIVE_KEY),null);assert.deepEqual(originals(s),raw);assert.equal(server.writes,1)
  const restored=readBackup(JSON.stringify(backup),owner)
  await firstImport(s,server,restored,proofOf(restored,s),true)
  assert.equal(server.writes,1);assert.equal(s.getItem(ACTIVE_KEY),owner)
})
test('Rücklesefehler, abweichende Daten, lokale Änderungen und Speicherfehler erzeugen keine falsche Aktivierung',async()=>{
  for(const failure of ['read','mismatch','local','quota']){
    const s=memory(),backup=backupOf(s),proof=proofOf(backup,s),server=remote();let reads=0
    const wrapped={inspect:async()=>{reads++;if(reads===2&&failure==='read')throw Error('read failed');const value=await server.inspect();if(reads===2&&failure==='mismatch')value.record.payload[AREAS[6]]=null;return value},initialize:async(...args)=>{await server.initialize(...args);if(failure==='local')s.setItem(AREAS[2],'{"version":1,"employees":[]}')}}
    if(failure==='quota'){const originalSet=s.setItem;s.setItem=(key,value)=>{if(key===ACTIVE_KEY)throw Error('quota');return originalSet(key,value)}}
    await assert.rejects(firstImport(s,wrapped,backup,proof,true))
    assert.equal(s.getItem(ACTIVE_KEY),null);assert.ok(s.getItem(AREAS[6]));assert.deepEqual(backup.raw[AREAS[6]],s.getItem(AREAS[6]))
    if(failure==='quota'){
      s.setItem=(key,value)=>s.values.set(key,value)
      assert.ok(s.getItem(CACHE_PREFIX+owner));await firstImport(s,server,backup,proof,true)
      assert.equal(s.getItem(ACTIVE_KEY),owner);assert.equal(server.writes,1)
    }
  }
})
test('Fremde Identität darf Initialisierungs-RPC nicht ausführen; Anmeldung alleine verursacht keinen Upload',async()=>{
  let rpcCalls=0
  const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:other},error:null})}
  const client={auth:{getUser:async()=>({data:{user:{id:other}}})},from:()=>query,rpc(){rpcCalls++}}
  const backend=supabaseRemote(client,owner)
  assert.equal(rpcCalls,0);await assert.rejects(backend.initialize({},token),/Sitzung/);assert.equal(rpcCalls,0)
})
