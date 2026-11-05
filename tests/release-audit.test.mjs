import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const compiled=await build({stdin:{contents:`export * from './src/modules/einstellungen/reset.ts'; export { buildDemo } from './src/modules/einstellungen/demo.ts'; export { AREAS, validatePayload } from './src/cloud/dataset.ts'; export { importPayload, makeBackup, readBackup } from './src/cloud/firstImport.ts'; export { readGeneratorContext } from './src/modules/dienstplan/generator.ts'; export { teamPlan, loadPublications, PUBLICATIONS_KEY } from './src/modules/dienstplan/publications.ts'; export { saveWeekTemplate, loadTemplates, TEMPLATES_KEY } from './src/modules/dienstplan/templates.ts';`,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'})
const {prepareReset,verifyResetBackup,resetLocalApp,RESET_PHRASE,buildDemo,AREAS,validatePayload,importPayload,makeBackup,readBackup,readGeneratorContext,teamPlan,loadPublications,PUBLICATIONS_KEY,saveWeekTemplate,loadTemplates,TEMPLATES_KEY}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
function memory(values=[]) {const data=new Map(values);return{data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}}
function fixture() {
 const payload=buildDemo('2027-01-04').payload,store=memory(AREAS.filter(key=>payload[key]!==null).map(key=>[key,JSON.stringify(payload[key])]))
 const plan=teamPlan(readGeneratorContext(store),'2027-01-04')
 store.setItem(PUBLICATIONS_KEY,JSON.stringify({version:1,plans:[{...plan,version:1,publishedAt:'2027-01-01T12:00:00Z'},{...plan,version:2,publishedAt:'2027-01-02T12:00:00Z'}]}))
 saveWeekTemplate(store,store,'2027-01-04','Fiktives Wochenmuster',true,'test-template')
 return store
}

test('Vorhandene Reset-Datei lässt die sieben enthaltenen Bereiche samt zwei Freigaben verlustfrei in einem isolierten Prüfspeicher wiederherstellen',()=>{
 const store=fixture(),original=[...store.data],backup=prepareReset(store),download=JSON.stringify(backup),proof=verifyResetBackup(download,backup)
 resetLocalApp(store,backup,proof,RESET_PHRASE)
 assert.ok(AREAS.every(key=>store.getItem(key)===null))
 const restored=memory(),parsed=JSON.parse(download)
 // QA-only reconstruction into fresh synthetic storage, not an application restore workflow.
 for(const key of AREAS) if(parsed.raw[key]!==null) restored.setItem(key,parsed.raw[key])
 for(const key of AREAS) assert.equal(restored.getItem(key),original.find(([name])=>name===key)?.[1]??null)
 assert.doesNotThrow(()=>validatePayload(importPayload(parsed.raw)))
 assert.equal(loadPublications(restored).plans.length,2)
 assert.equal(JSON.stringify(loadPublications(restored)),backup.raw[PUBLICATIONS_KEY])
})

test('Sicherungsgrenze ist nachgewiesen: Vorlagen überleben Reset, fehlen aber in beiden bisherigen Backup-Dateien',()=>{
 const store=fixture(),templates=store.getItem(TEMPLATES_KEY),reset=prepareReset(store)
 const cloud=makeBackup(store,'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')
 assert.equal(Object.hasOwn(reset.raw,TEMPLATES_KEY),false);assert.equal(Object.hasOwn(cloud.raw,TEMPLATES_KEY),false)
 assert.throws(()=>readBackup(JSON.stringify(reset),cloud.owner),/Sicherung/)
 resetLocalApp(store,reset,verifyResetBackup(JSON.stringify(reset),reset),RESET_PHRASE)
 assert.equal(store.getItem(TEMPLATES_KEY),templates)
 assert.equal(loadTemplates(store).templates.length,1)
 const fresh=memory(AREAS.filter(key=>reset.raw[key]!==null).map(key=>[key,reset.raw[key]]))
 assert.equal(loadTemplates(fresh).templates.length,0)
})
