import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const module = await build({entryPoints:['src/cloud/access.ts'],bundle:true,write:false,format:'esm',platform:'node'})
const { verifyCloudAccess } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`)
const { cloudConfiguration } = await import('../src/cloud/config.ts')

test('Build-Konfiguration erlaubt ausschließlich HTTPS-Projekt-URL und Publishable Key; Fehler enthalten keine Werte',()=>{
  const key = 'sb_publishable_'+ 'a'.repeat(30)
  assert.equal(cloudConfiguration().mode,'local')
  assert.equal(cloudConfiguration('https://exampleproject.supabase.co',key).mode,'ready')
  for(const [url,value] of [['https://exampleproject.supabase.co','sb_secret_do_not_expose'],['https://exampleproject.supabase.co','eyJ_legacy_jwt'],['http://exampleproject.supabase.co',key],['https://attacker.example',key],['https://user:password@exampleproject.supabase.co',key],['https://exampleproject.supabase.co/path',key],['https://exampleproject.supabase.co',''],['',key]]) {
    const config = cloudConfiguration(url,value)
    assert.equal(config.mode,'invalid')
    assert.ok(!config.message.includes(value || 'PASSWORD') && !config.message.includes(url || 'PASSWORD'))
  }
})
function fake(user, membership, memberError = null) {
  const calls=[]
  const query = { select(value){calls.push(['select',value]);return query},eq(key,value){calls.push(['eq',key,value]);return query},async maybeSingle(){return {data:membership,error:memberError}} }
  return { calls, auth:{ async getUser(){calls.push(['getUser']);return {data:{user},error:user?null:{name:'AuthSessionMissingError'}} } }, from(table){calls.push(['from',table]);assert.equal(table,'caro_members');return query} }
}
test('Nur serverbestätigter Benutzer mit eigener Freigabe wird Cloud verbunden; keine App-Daten gelesen/geschrieben',async()=>{
  const client=fake({id:'owner'}, {user_id:'owner'})
  assert.equal((await verifyCloudAccess(client)).connected,true)
  assert.deepEqual(client.calls[0],['getUser'])
  assert.ok(client.calls.some(call=>JSON.stringify(call)===JSON.stringify(['eq','user_id','owner'])))
  assert.ok(client.calls.some(call=>JSON.stringify(call)===JSON.stringify(['eq','enabled',true])))
  assert.equal((await verifyCloudAccess(fake(null,null))).connected,false)
})
test('Fehlende/fremde Freigabe und Fehler bleiben lokal; editierbare User-Metadaten erteilen keinen Zugriff',async()=>{
  const user={id:'owner',user_metadata:{approved:true},app_metadata:{}}
  for(const membership of [null,{user_id:'someone-else'}]) {
    const result=await verifyCloudAccess(fake(user,membership))
    assert.equal(result.connected,false);assert.equal(result.denied,true)
  }
  const error=await verifyCloudAccess(fake(user,null,{message:'private server detail'}))
  assert.equal(error.connected,false);assert.doesNotMatch(error.message,/private server detail/)
  const offline=await verifyCloudAccess({auth:{getUser(){throw Error('secret data')}}})
  assert.equal(offline.connected,false);assert.doesNotMatch(offline.message,/secret data/)
})
