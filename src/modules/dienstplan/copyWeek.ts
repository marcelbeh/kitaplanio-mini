import type { StorageAccess } from '../kita/setup'
import { ACTIVE_KEY } from '../../cloud/workspace'
import { readGeneratorContext } from './generator'
import type { GeneratorContext } from './generator'
import { loadPublications, PUBLICATIONS_KEY } from './publications'
import { calendarWeek, overlappingShifts, SHIFTS_KEY, shiftWarnings, validDate, validateShift } from './schedule'
import type { Shift } from './schedule'
import { checkPlan } from './checks'
import type { PlanIssue } from './checks'
import { respectsLimits } from './fairness'

export type WeekPattern = Pick<Shift, 'employeeId' | 'groupId' | 'start' | 'end' | 'breakMinutes'> & { weekday: number }
export type SkippedCopy = { source: Shift; date: string; reasons: string[] }
export type WeekCopy = { source: string; target: string; shifts: Shift[]; skipped: SkippedCopy[]; issues: PlanIssue[]; ids: Record<string, string>; snapshot: (string | null)[]; publications: string | null; workspace: string | null; pattern?: WeekPattern[] }
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
function week(date: string) {
  if (!validDate(date)) throw Error('Bitte ein gültiges Datum in Quell- und Zielwoche auswählen.')
  const result = calendarWeek(date)
  if (result.days.some(day => day < '0002-01-01' || day > '9998-12-31')) throw Error('Die vollständige Woche muss zwischen 0002 und 9998 liegen.')
  return result
}
function read(storage: StorageAccess) {
  const publications = storage.getItem(PUBLICATIONS_KEY), workspace = storage.getItem(ACTIVE_KEY)
  const context = readGeneratorContext(storage), plans = loadPublications(storage).plans
  if (storage.getItem(PUBLICATIONS_KEY) !== publications || storage.getItem(ACTIVE_KEY) !== workspace) throw Error('Arbeitsbereich oder Freigaben wurden inzwischen geändert. Bitte neu prüfen.')
  return { context, plans, publications, workspace }
}
function related(issue: PlanIssue, shift: Shift) {
  return [`availability:${shift.id}`, `group:${shift.id}`, `duplicate:${shift.id}`, `person:${shift.employeeId}`, `fixed:${shift.employeeId}:${shift.date}`, `absence:${shift.employeeId}:${shift.date}`].includes(issue.id) || issue.id.startsWith('overlap:') && issue.id.split(':').slice(1).includes(shift.id)
}
function build(context: GeneratorContext, source: string, target: string, makeId: (source: Shift) => string, sourceShifts = context.shifts, pattern = false) {
  const from = week(source), to = week(target)
  if (!pattern && from.monday === to.monday) throw Error('Quell- und Zielwoche müssen unterschiedlich sein.')
  const skipped: SkippedCopy[] = [], ids: Record<string, string> = Object.create(null), used = new Set(context.shifts.map(shift => shift.id))
  let shifts: Shift[] = []
  const mapping = new Map<string, Shift>()
  for (const source of sourceShifts.filter(shift => shift.date >= from.monday && shift.date <= from.days[6])) {
    const date = to.days[from.days.indexOf(source.date)], id = makeId(source)
    if (typeof id !== 'string' || !id.trim() || id.includes(':') || used.has(id)) throw Error('Keine eindeutige neue Schicht-ID. Es wurde nichts gespeichert.')
    used.add(id); ids[source.id] = id
    const person = context.employees.find(person => person.id === source.employeeId)
    const candidate: Shift = { ...source, id, date, employeeName: person?.name ?? source.employeeName }
    const reasons = validateShift(source)
    if (!person) reasons.push('Mitarbeiter ist nicht mehr im Team.')
    if (!context.setup?.groups.some(group => group.id === source.groupId)) reasons.push('Gruppe ist nicht mehr vorhanden.')
    const combined = [...context.shifts, ...shifts]
    if (overlappingShifts(candidate, combined).length) reasons.push('Überschneidung mit einer vorhandenen oder bereits vorgemerkten Zielschicht.')
    reasons.push(...shiftWarnings(candidate, context.absences, context.events, context.employees))
    if (!respectsLimits(candidate.employeeId, date, minute(candidate.start), minute(candidate.end), combined, context.setup?.planningRules)) reasons.push('Ausdrücklich hinterlegte Dienstdauer oder Ruhezeit wird nicht eingehalten.')
    if (reasons.length) skipped.push({ source, date, reasons: [...new Set(reasons)] })
    else { shifts.push(candidate); mapping.set(id, source) }
  }
  const inspect = (copies: Shift[]) => checkPlan({ from: to.monday, to: to.days[6], setup: context.setup, employees: context.employees, absences: context.absences, inspection: { entries: [...context.shifts, ...copies] }, options: context.setup?.planningRules })
  const checked = inspect(shifts)
  // Check complete person-days together, preserving valid split shifts with binding daily times.
  shifts = shifts.filter(shift => {
    const problems = checked.filter(issue => issue.kind === 'conflict' && related(issue, shift))
    if (!problems.length) return true
    skipped.push({ source: mapping.get(shift.id)!, date: shift.date, reasons: [...new Set(problems.map(issue => issue.cause))] }); return false
  })
  return { source: from.monday, target: to.monday, shifts, skipped, ids, issues: inspect(shifts) }
}
export function prepareWeekCopy(storage: StorageAccess, source: string, target: string, makeId: (source: Shift) => string = () => crypto.randomUUID()): WeekCopy {
  const state = read(storage), targetWeek = week(target)
  if (state.plans.some(plan => plan.from === targetWeek.monday)) throw Error('Zielwoche ist bereits veröffentlicht. Kopieren ist gesperrt; Freigaben und Arbeitsplan bleiben unverändert.')
  return { ...build(state.context, source, target, makeId), snapshot: state.context.snapshot, publications: state.publications, workspace: state.workspace }
}
// A date-free pattern uses the SAME eligibility checks; its source rows never enter plan storage.
export function preparePatternCopy(storage: StorageAccess, pattern: WeekPattern[], target: string, makeId: (source: Shift) => string = () => crypto.randomUUID()): WeekCopy {
  const state = read(storage), targetWeek = week(target)
  if (state.plans.some(plan => plan.from === targetWeek.monday)) throw Error('Zielwoche ist bereits veröffentlicht. Anwenden ist gesperrt.')
  if (!pattern.length) throw Error('Die Vorlage enthält keine Schichten.')
  const sourceShifts = pattern.map((entry, index): Shift => {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6) throw Error('Ungültiger Vorlagen-Wochentag.')
    const shift: Shift = { id: `pattern-${index}`, employeeId: entry.employeeId, groupId: entry.groupId, date: targetWeek.days[entry.weekday], start: entry.start, end: entry.end, ...(entry.breakMinutes === undefined ? {} : { breakMinutes: entry.breakMinutes }), employeeName: state.context.employees.find(person => person.id === entry.employeeId)?.name }
    if (validateShift(shift).length) throw Error('Ungültige Vorlagenschicht.')
    return shift
  })
  return { ...build(state.context, targetWeek.monday, target, makeId, sourceShifts, true), pattern, snapshot: state.context.snapshot, publications: state.publications, workspace: state.workspace }
}
export function adoptWeekCopy(storage: StorageAccess, preview: WeekCopy, confirmed: boolean): number {
  if (!confirmed) throw Error('Bitte die geprüfte Zusammenfassung ausdrücklich bestätigen.')
  function unchanged() {
    const state = read(storage)
    if (JSON.stringify(state.context.snapshot) !== JSON.stringify(preview.snapshot) || state.publications !== preview.publications || state.workspace !== preview.workspace) throw Error('Speicherstand, Freigaben oder Arbeitsbereich wurden inzwischen geändert. Bitte neue Vorschau erstellen; nichts gespeichert.')
    return state
  }
  unchanged()
  const current = preview.pattern ? preparePatternCopy(storage, preview.pattern, preview.target, source => preview.ids[source.id]) : prepareWeekCopy(storage, preview.source, preview.target, source => preview.ids[source.id])
  if (JSON.stringify(current.shifts) !== JSON.stringify(preview.shifts) || JSON.stringify(current.skipped) !== JSON.stringify(preview.skipped) || JSON.stringify(current.issues) !== JSON.stringify(preview.issues)) throw Error('Vorschau stimmt nicht mehr mit der Prüfung überein. Bitte erneut prüfen.')
  if (!current.shifts.length) throw Error('Keine konfliktfrei übertragbaren Schichten vorhanden.')
  const state = unchanged()
  // One existing-key write, including in a P8b workspace. Storage failures preserve the entire old plan.
  storage.setItem(SHIFTS_KEY, JSON.stringify({ version: 1, shifts: [...state.context.shifts, ...current.shifts] }))
  return current.shifts.length
}
