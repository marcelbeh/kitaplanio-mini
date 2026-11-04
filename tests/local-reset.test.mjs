import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
async function bundle(path) {
  const result=await build({entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node'})
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
}
const {prepareReset,verifyResetBackup,resetLocalApp,RESET_PHRASE}=await bundle('src/modules/einstellungen/reset.ts')
const {AREAS}=await bundle('src/cloud/dataset.ts')
const {ACTIVE_KEY,CACHE_PREFIX}=await bundle('src/cloud/workspace.ts')
const {shouldStartInterview,startInterview}=await bundle('src/modules/kita/interview.ts')
const {loadPublications}=await bundle('src/modules/dienstplan/publications.ts')
function memory() {
  const values=new Map(AREAS.map((key,i)=>[key,`original raw ${i} (including corrupt JSON)`]))
  values.set('caro:auth:v1','private auth unchanged');values.set(CACHE_PREFIX+'owner','offline cloud cache unchanged');values.set('other-app:data','foreign unchanged');values.set('kitaplanio-lite:unknown:v9','unknown unchanged')
  const writes=[]
  return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(['set',key]);values.set(key,value)},removeItem(key){writes.push(['remove',key]);values.delete(key)}}
}
const proof=backup=>verifyResetBackup(JSON.stringify(backup),backup)
test('Backup umfasst alle sieben Keys einschließlich Rohdaten/null; ohne geprüfte Datei und eindeutige Bestätigung kein Reset',()=>{
  const s=memory();s.values.delete(AREAS[5]);const before=[...s.values],backup=prepareReset(s)
  assert.deepEqual(Object.keys(backup.raw),AREAS);assert.equal(backup.raw[AREAS[5]],null)
  assert.match(backup.raw[AREAS[0]],/corrupt/);assert.equal(backup.format,'caro-local-reset-backup');assert.equal(backup.version,1)
  assert.equal(Object.hasOwn(backup.raw,'caro:auth:v1'),false)
  assert.throws(()=>verifyResetBackup('{invalid',backup),/JSON/)
  assert.throws(()=>verifyResetBackup(JSON.stringify({...backup,version:2}),backup),/stimmt nicht/)
  assert.throws(()=>resetLocalApp(s,backup,null,RESET_PHRASE),/Sicherung/)
  assert.throws(()=>resetLocalApp(s,backup,proof(backup),'zurücksetzen'),/bestätigen/)
  assert.deepEqual([...s.values],before);assert.equal(s.writes.length,0)
})
test('Reset entfernt exakt die fachlichen Keys, erhält Auth/Cloud-Caches/fremde Daten und startet leere Einrichtung statt alter Freigaben',()=>{
  const s=memory(),backup=prepareReset(s),retained=[...s.values].filter(([key])=>!AREAS.includes(key))
  resetLocalApp(s,backup,proof(backup),RESET_PHRASE)
  for(const key of AREAS)assert.equal(s.getItem(key),null)
  assert.deepEqual([...s.values],retained);assert.equal(s.writes.length,7)
  assert.ok(shouldStartInterview(s));const flow=startInterview(s)
  assert.equal(flow.status,'draft');assert.equal(flow.step,0);assert.equal(flow.setup.completed,false)
  assert.equal(flow.team.length,0);assert.deepEqual(loadPublications(s).plans,[])
})
test('Aktiver oder beschädigter Cloud-Zeiger sperrt Vorbereitung und spätere Bestätigung ohne Löschoperationen',()=>{
  for(const value of ['owner','']){
    const s=memory(),backup=prepareReset(s);s.values.set(ACTIVE_KEY,value);const before=[...s.values]
    assert.throws(()=>prepareReset(s),/gesperrt/)
    assert.throws(()=>resetLocalApp(s,backup,proof(backup),RESET_PHRASE),/gesperrt/)
    assert.deepEqual([...s.values],before);assert.equal(s.writes.length,0)
  }
})
test('Änderungen seit Backup oder fehlender Speicherzugriff löschen keine Daten',()=>{
  const s=memory(),backup=prepareReset(s);s.values.set(AREAS[1],'new interview');const before=[...s.values]
  assert.throws(()=>resetLocalApp(s,backup,proof(backup),RESET_PHRASE),/inzwischen geändert/)
  assert.deepEqual([...s.values],before);assert.equal(s.writes.length,0)
  assert.throws(()=>prepareReset({getItem(){throw Error('blocked')}}),/blocked/)
})
test('Teilweiser Löschfehler stellt Originalwerte wieder her; blockierte Wiederherstellung meldet ausdrücklich einen Fehler',()=>{
  for(const failRestore of [false,true]){
    const s=memory(),backup=prepareReset(s),before=new Map(s.values),remove=s.removeItem,set=s.setItem
    s.removeItem=key=>{if(key===AREAS[2])throw Error('blocked');remove(key)}
    if(failRestore)s.setItem=()=>{throw Error('blocked restore')}
    assert.throws(()=>resetLocalApp(s,backup,proof(backup),RESET_PHRASE),failRestore?/teilweise blockiert/:/wiederhergestellt/)
    if(!failRestore)assert.deepEqual(s.values,before)
    assert.equal(s.getItem('caro:auth:v1'),before.get('caro:auth:v1'));assert.equal(s.getItem(CACHE_PREFIX+'owner'),before.get(CACHE_PREFIX+'owner'))
    assert.equal(backup.raw[AREAS[0]],before.get(AREAS[0]));s.setItem=set
  }
})
test('Cloud-Wechsel während Reset bricht ab und stellt lokale Daten wieder her; parallele Änderungen werden nicht überschrieben',()=>{
  const s=memory(),backup=prepareReset(s),remove=s.removeItem
  s.removeItem=key=>{remove(key);if(key===AREAS[0])s.values.set(ACTIVE_KEY,'owner')}
  assert.throws(()=>resetLocalApp(s,backup,proof(backup),RESET_PHRASE),/wiederhergestellt/)
  for(const key of AREAS)assert.equal(s.getItem(key),backup.raw[key])
  const t=memory(),other=prepareReset(t),removeOther=t.removeItem
  t.removeItem=key=>{if(key===AREAS[1]){t.values.set(AREAS[0],'concurrent edit');throw Error('conflict')}removeOther(key)}
  assert.throws(()=>resetLocalApp(t,other,proof(other),RESET_PHRASE),/teilweise blockiert/)
  assert.equal(t.getItem(AREAS[0]),'concurrent edit')
})
