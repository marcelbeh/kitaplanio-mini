import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { loadSetup, savePlanningLimits, STORAGE_KEY } from '../src/modules/kita/setup.ts'
import { loadEmployees, saveEmployee, EMPLOYEES_KEY } from '../src/modules/mitarbeiter/employees.ts'
async function bundle(file) { const result = await build({ entryPoints: [file], bundle: true, write: false, platform: 'node', format: 'esm' }); return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`) }
const { readGeneratorContext, generateProposal, proposalIssues } = await bundle('src/modules/dienstplan/generator.ts')
const { fairnessReport, respectsLimits } = await bundle('src/modules/dienstplan/fairness.ts')
const days = ['mon','tue','wed','thu','fri']
const setup = { version: 1, completed: true, careDays: days, opening: { start: '07:00', end: '10:00' }, early: { start: '07:00', end: '08:00', minimum: 1 }, late: { start: '09:00', end: '10:00', minimum: 1 }, groups: [{ id: 'g', name: 'Sonne', periods: [{ start: '08:00', end: '09:00', minimum: 1 }] }] }
const person = (id, weeklyMinutes = 900, patch = {}) => ({ id, name: id, groupId: 'g', qualification: 'Erzieherin', weeklyMinutes, workdays: days, availability: { start: '07:00', end: '22:00' }, fixedTimes: {}, rules: [], ...patch })
const shift = (id, employeeId, date, start = '07:00', end = '08:00') => ({ id, employeeId, groupId: 'g', date, start, end, breakMinutes: 0 })
function memory(people = [person('a'),person('b')], shifts = [], settings = setup) {
  const values = new Map([[STORAGE_KEY, JSON.stringify(settings)], [EMPLOYEES_KEY, JSON.stringify({ version: 1, employees: people })], ['kitaplanio-lite:shifts:v1', JSON.stringify({ version: 1, shifts })]])
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const weekend = ['2027-01-09','2027-01-10'].map(date => ({ date, groupId: 'g', start: '18:00', end: '20:00', minimum: 1 }))
function make(storage, demands = []) { const context = readGeneratorContext(storage); const proposal = generateProposal(context, '2027-01-04', demands); return { context, proposal, report: fairnessReport(context, proposal) } }

test('Früh-, Spät- und Wochenenddienste unter vergleichbar geeigneten Personen ausgeglichen, vorhandene Dienste fest', () => {
  const existing = [shift('fixed','a','2027-01-04')], storage = memory(undefined, existing), before = [...storage.values]
  const plan = make(storage, weekend), rows = plan.report.rows
  for (const kind of ['early','late','weekend']) assert.ok(Math.abs(rows[0][kind] - rows[1][kind]) <= 1, `${kind}: ${JSON.stringify(rows)}`)
  assert.equal(rows.reduce((sum,row) => sum + row.weekend,0), 2)
  assert.deepEqual(plan.context.shifts, existing)
  assert.equal(proposalIssues(plan.context, plan.proposal).filter(issue => issue.kind === 'conflict').length, 0)
  assert.deepEqual(make(storage, weekend).proposal, plan.proposal)
  assert.ok(plan.proposal.explanations.length > 0)
  assert.deepEqual([...storage.values], before)
})

test('Teilzeit proportional: Stunden und Dienstkategorien werden durch Vertragsumfang gewichtet', () => {
  const { report } = make(memory([person('full',1200),person('part',600)]), weekend)
  const full = report.rows.find(row => row.id === 'full'), part = report.rows.find(row => row.id === 'part')
  assert.ok(full.net > part.net)
  assert.ok(Math.abs(full.net / full.contract - part.net / part.contract) <= 180 / part.contract, JSON.stringify(report.rows))
  for (const kind of ['early','late','weekend']) assert.ok(Math.abs(full[kind] / full.contract - part[kind] / part.contract) <= 1 / part.contract + 1e-12, `${kind}: ${JSON.stringify(report.rows)}`)
})

test('Strukturierte Wünsche bevorzugt; Verfügbarkeit, Abwesenheit und gespeicherte Grenzen haben Vorrang', () => {
  const free = make(memory([person('a',900,{preferences:{preferredDaysOff:['mon']}}),person('b')]))
  assert.ok(!free.proposal.shifts.some(shift => shift.employeeId === 'a' && shift.date === '2027-01-04'))
  const both = make(memory([person('a',900,{preferences:{preferredDaysOff:['mon']}}),person('b',900,{preferences:{preferredDaysOff:['mon']}})]))
  assert.ok(both.report.warnings.some(warning => warning.includes('freier Tag nicht erfüllt')))
  const hours = make(memory([person('a',900,{preferences:{preferredHours:{start:'07:00',end:'08:00'}}}),person('b',900,{preferences:{preferredHours:{start:'08:00',end:'10:00'}}})]))
  assert.ok(hours.proposal.shifts.filter(shift=>shift.employeeId==='a').every(shift=>shift.end<='08:00'))
  const blocked = make(memory([person('a',900,{availability:{start:'09:00',end:'22:00'},preferences:{preferredHours:{start:'07:00',end:'08:00'}}}),person('b')]))
  assert.ok(blocked.proposal.shifts.filter(shift=>shift.employeeId==='a').every(shift=>shift.start>='09:00'))
  assert.equal(respectsLimits('a','2027-01-04',480,495,[shift('old','a','2027-01-04')],{maxShiftMinutes:60}), false)
  assert.equal(respectsLimits('a','2027-01-10',420,480,[shift('sat','a','2027-01-09','20:00','22:00')],{minRestMinutes:600}), false)
  assert.equal(respectsLimits('a','2027-01-10',420,480,[shift('sat','a','2027-01-09','20:00','22:00')]), true)
  const limited = make(memory(undefined,[],{...setup,planningRules:{maxShiftMinutes:60,minRestMinutes:600}}))
  assert.ok(limited.proposal.shifts.every(shift => (Number(shift.end.slice(0,2))*60+Number(shift.end.slice(3)))-(Number(shift.start.slice(0,2))*60+Number(shift.start.slice(3))) <= 60))
  assert.ok(limited.proposal.reasons.some(reason => reason.includes('Gespeicherte')))
})

test('Dauerhafte Grenzen und optionale Wünsche überstehen erneutes Laden ohne Migration oder Änderung anderer Daten', () => {
  const storage = memory(), shifts = storage.getItem('kitaplanio-lite:shifts:v1')
  assert.equal(loadSetup(storage).planningRules, undefined)
  savePlanningLimits(storage,{maxShiftMinutes:480,minRestMinutes:660})
  assert.deepEqual(loadSetup(storage).planningRules,{maxShiftMinutes:480,minRestMinutes:660})
  const reloaded = readGeneratorContext(storage)
  assert.equal(reloaded.setup.planningRules.minRestMinutes,660)
  assert.deepEqual(loadSetup(storage).groups,setup.groups)
  assert.equal(storage.getItem('kitaplanio-lite:shifts:v1'),shifts)
  const raw = storage.getItem(STORAGE_KEY)
  assert.throws(()=>savePlanningLimits(storage,{maxShiftMinutes:-1}))
  assert.equal(storage.getItem(STORAGE_KEY),raw)
  savePlanningLimits(storage,{})
  assert.deepEqual(loadSetup(storage).planningRules,{})
  const employee = {...person('a'),preferences:{preferredDaysOff:['fri','sun'],preferredHours:{start:'08:00',end:'14:00'}}}
  saveEmployee(storage,employee,setup.groups,'update')
  assert.deepEqual(loadEmployees(storage).employees.find(item=>item.id==='a').preferences,employee.preferences)
  assert.equal(loadEmployees(storage).employees.find(item=>item.id==='b').preferences,undefined)
  assert.equal(storage.values.size,3)
})

test('Auffällige Verteilung wird mit Zählbasis erklärt; unterschiedliche Eignung wird nicht als Vergleich behauptet', () => {
  const entries = ['2027-01-04','2027-01-05','2027-01-06'].map((date,index)=>shift(String(index),'a',date))
  const context = readGeneratorContext(memory(undefined,entries))
  const proposal = {from:'2027-01-04',to:'2027-01-10',shifts:[],demands:[],reasons:[]}
  assert.ok(fairnessReport(context,proposal).warnings.some(warning=>warning.includes('Frühdienste')))
  context.employees[1].availability.start='09:00'
  assert.ok(!fairnessReport(context,proposal).warnings.some(warning=>warning.includes('Frühdienste')))
})
