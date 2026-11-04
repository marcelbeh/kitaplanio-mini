import { parseAnswer, parseRequest } from '../../../supabase/functions/_shared/assistant-protocol'
import type { AiAnswer, AiRequest, AnonymousShift, Task } from '../../../supabase/functions/_shared/assistant-protocol'
import type { StorageAccess } from '../kita/setup'
import { ACTIVE_KEY } from '../../cloud/workspace'
import { readGeneratorContext, generateProposal, proposalIssues, adoptProposal } from '../dienstplan/generator'
import type { Draft, GeneratorContext } from '../dienstplan/generator'
import { loadPublications, PUBLICATIONS_KEY } from '../dienstplan/publications'
import { addDays, calendarWeek, validateShift, shiftWarnings, workTime } from '../dienstplan/schedule'
import type { Shift } from '../dienstplan/schedule'
import { checkPlan } from '../dienstplan/checks'
import { calculateStaffing } from '../dienstplan/staffing'
import { respectsLimits } from '../dienstplan/fairness'
import { analyticsReport, reportRange } from '../auswertungen/analytics'
import { affectedEmployeeIds, listOccurrences } from '../termine/events'
import type { Weekday } from '../mitarbeiter/employees'

export type AiSession = { request: AiRequest; context: GeneratorContext; publications: string | null; workspace: string | null; people: Map<string, string>; groups: Map<string, string> }
export type AiPreview = { session: AiSession; answer: AiAnswer; draft: Draft; blockers: string[]; issues: ReturnType<typeof proposalIssues> }
const day = (date: string) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
// Keep hard rule results, but don't turn workTime's fallback into exact net-hour hints.
function pauseAwareIssues(issues: ReturnType<typeof proposalIssues>, context: GeneratorContext, from: string, to: string) {
  const unknown = new Set(context.shifts.filter(shift => shift.date >= from && shift.date <= to && shift.breakMinutes === undefined).map(shift => shift.employeeId))
  return [...issues.filter(issue => ![...unknown].some(id => issue.kind === 'hint' && [`hours:${id}`, `distribution:${id}`].includes(issue.id))), ...[...unknown].map(id => ({
    id: `pause:${id}`, kind: 'hint' as const, date: from, person: context.employees.find(person => person.id === id)?.name ?? 'Mitarbeiter',
    cause: 'Pausendauer nicht vollständig festgelegt. Nettozeit und Vergleich mit Vertragsstunden sind ungeklärt.',
    correction: 'Pausen ausdrücklich erfassen (auch 0 Minuten, falls tatsächlich keine Pause vorgesehen ist); danach Stunden erneut prüfen.',
  }))]
}
// Construct every field explicitly. Never serialize domain objects or replace names in free text.
export function prepareAiSession(storage: StorageAccess, task: Task, date: string): AiSession {
  const context = readGeneratorContext(storage), setup = context.setup
  if (!setup?.completed || !context.employees.length) throw Error('Bitte zuerst Kita und Mitarbeitende vollständig einrichten. Fehlende Vorgaben werden nicht erfunden.')
  const { from, to } = reportRange(task === 'late' ? 'month' : 'week', date)
  const publications = storage.getItem(PUBLICATIONS_KEY), published = loadPublications(storage)
  if (task === 'plan' && published.plans.some(plan => plan.from === from)) throw Error('Diese Woche ist bereits veröffentlicht. KI-Vorschläge dürfen sie nicht verändern.')
  const people = new Map(context.employees.map((person, i) => [person.id, `P${i + 1}`]))
  const groups = new Map(setup.groups.map((group, i) => [group.id, `G${i + 1}`]))
  const person = (id: string) => { const value = people.get(id); if (!value) throw Error('Unbekannte Mitarbeiterzuordnung. Bitte den Datenbestand zuerst prüfen.'); return value }
  const group = (id: string) => { const value = groups.get(id); if (!value) throw Error('Unbekannte Gruppenzuordnung. Bitte den Datenbestand zuerst prüfen.'); return value }
  const anonymous = (shift: Shift): AnonymousShift => ({ person: person(shift.employeeId), group: group(shift.groupId), date: shift.date, start: shift.start, end: shift.end, pause: shift.breakMinutes ?? null })
  const restDays = setup.planningRules?.minRestMinutes ? Math.min(7, Math.ceil(setup.planningRules.minRestMinutes / 1440)) : 0
  const weekly = task !== 'late', baseline = task === 'plan' ? generateProposal(context, from).shifts : []
  const localIssues = weekly ? pauseAwareIssues(checkPlan({ from, to, setup, employees: context.employees, absences: context.absences, inspection: { entries: context.shifts } }), context, from, to) : []
  const report = analyticsReport(context, task === 'late' ? 'month' : 'week', date)
  const codes = ['overlap', 'absence', 'invalid', 'duplicate', 'person', 'group', 'availability', 'fixed', 'rest', 'hours', 'distribution', 'text', 'staff', 'demand', 'pause', 'half', 'long']
  const coverage = weekly ? calendarWeek(from).days.flatMap(date => calculateStaffing(date, setup, context.shifts, context.absences, context.employees).windows.map(window => ({ date, area: window.area.startsWith('group:') ? group(window.area.slice(6)) : window.area, start: window.start, end: window.end, required: window.required, actual: window.actual, possible: window.possible, status: window.status }))) : []
  const request: AiRequest = {
    version: 1, task, from, to,
    people: context.employees.map(item => ({ id: person(item.id), group: group(item.groupId), weeklyMinutes: item.weeklyMinutes, workdays: weekly ? [...item.workdays] : null, availability: weekly ? { start: item.availability.start, end: item.availability.end } : null,
      fixed: weekly ? Object.entries(item.fixedTimes).map(([day, time]) => ({ day, start: time.start, end: time.end })) : null, wishDays: weekly ? [...item.preferences?.preferredDaysOff ?? []] : null, wishHours: weekly && item.preferences?.preferredHours ? { start: item.preferences.preferredHours.start, end: item.preferences.preferredHours.end } : null,
      manualRules: weekly ? item.rules.map(rule => ({ type: rule.type, day: rule.weekday })) : null })),
    groups: setup.groups.map(item => ({ id: group(item.id), periods: weekly ? item.periods.map(period => ({ start: period.start, end: period.end, minimum: Number.isSafeInteger(period.minimum) && period.minimum > 0 ? period.minimum : null })) : null })),
    settings: weekly ? { completed: setup.completed, careDays: [...setup.careDays ?? ['mon', 'tue', 'wed', 'thu', 'fri']], opening: { start: setup.opening.start, end: setup.opening.end }, early: { start: setup.early.start, end: setup.early.end, minimum: setup.early.minimum > 0 ? setup.early.minimum : null }, late: { start: setup.late.start, end: setup.late.end, minimum: setup.late.minimum > 0 ? setup.late.minimum : null }, maxShiftMinutes: setup.planningRules?.maxShiftMinutes ?? null, minRestMinutes: setup.planningRules?.minRestMinutes ?? null } : null,
    // Neighbouring shifts are required for configured rest checks; no archived publications or chat history.
    shifts: weekly ? context.shifts.filter(shift => shift.date >= addDays(from, -restDays) && shift.date <= addDays(to, restDays)).map(anonymous) : [], baseline: baseline.map(anonymous),
    absences: weekly ? context.absences.filter(item => item.startDate <= to && item.endDate >= from).map(item => ({ person: person(item.employeeId), from: item.startDate < from ? from : item.startDate, to: item.endDate > to ? to : item.endDate, portion: item.portion })) : [],
    events: weekly ? listOccurrences(context.events, from, to).map(item => { const event = context.events.find(event => event.id === item.eventId)!; return { date: item.date, start: item.start, end: item.end, people: affectedEmployeeIds(event, context.employees).map(person), groups: event.groupIds.map(group), wholeTeam: event.wholeTeam } }) : [],
    coverage, issues: localIssues.map(issue => ({ date: issue.date, kind: issue.kind, code: codes.includes(issue.id.split(':')[0]) ? issue.id.split(':')[0] : 'other' })),
    hours: report.rows.map(item => ({ person: person(item.id), net: item.missingBreak ? null : item.net, early: item.early, core: item.core, late: item.late, weekend: item.weekend })),
  }
  parseRequest(request)
  return { request, context, publications, workspace: storage.getItem(ACTIVE_KEY), people, groups }
}
export function assertAiCurrent(storage: StorageAccess, session: AiSession) {
  let current: GeneratorContext
  try { current = readGeneratorContext(storage) } catch { throw Error('Die Daten sind nicht mehr lesbar. Bitte den Bestand prüfen; es wurde nichts gespeichert.') }
  if (storage.getItem(ACTIVE_KEY) !== session.workspace || storage.getItem(PUBLICATIONS_KEY) !== session.publications || JSON.stringify(current.snapshot) !== JSON.stringify(session.context.snapshot)) throw Error('Arbeitsbereich, Daten oder Freigaben wurden geändert. Bitte eine neue KI-Anfrage starten; es wurde nichts gespeichert.')
  if (session.request.task === 'plan' && loadPublications(storage).plans.some(plan => plan.from === session.request.from)) throw Error('Veröffentlichte Wochen sind gesperrt.')
}
export function aiPreview(session: AiSession, value: unknown): AiPreview {
  const answer = parseAnswer(value, session.request), context = session.context
  const personIds = new Map([...session.people].map(([id, alias]) => [alias, id])), groupIds = new Map([...session.groups].map(([id, alias]) => [alias, id]))
  const shifts: Shift[] = answer.shifts.map((item, i) => {
    let id = `caro-ai:${session.request.from}:${i}`
    while (context.shifts.some(shift => shift.id === id)) id += ':'
    const employeeId = personIds.get(item.person)!
    return { id, employeeId, employeeName: context.employees.find(person => person.id === employeeId)!.name, groupId: groupIds.get(item.group)!, date: item.date, start: item.start, end: item.end }
  })
  const blockers: string[] = []
  for (const shift of shifts) {
    const person = context.employees.find(person => person.id === shift.employeeId)!, weekday = day(shift.date)
    if (shift.groupId !== person.groupId) blockers.push(`${shift.date} · ${person.name}: KI-Zuordnung außerhalb der hinterlegten Stammgruppe; bitte manuell prüfen und planen.`)
    if (validateShift(shift).length) blockers.push(`${shift.date} · ${person.name}: Ungültige Schichtdaten.`)
    if (!person.workdays.includes(weekday as Weekday)) blockers.push(`${shift.date} · ${person.name}: Kein hinterlegter regulärer Arbeitstag.`)
    if (context.absences.some(item => item.employeeId === person.id && item.startDate <= shift.date && item.endDate >= shift.date)) blockers.push(`${shift.date} · ${person.name}: Abwesenheit bzw. ungeklärter Halbtag; keine automatische Zuordnung.`)
    if (person.rules.some(rule => rule.type === 'must' && (rule.weekday === null || rule.weekday === weekday))) blockers.push(`${shift.date} · ${person.name}: Muss-Freitextregel ist nicht automatisch auswertbar; bitte manuell planen.`)
    if (!respectsLimits(person.id, shift.date, minute(shift.start), minute(shift.end), [...context.shifts, ...shifts.filter(item => item.id !== shift.id)], context.setup?.planningRules)) blockers.push(`${shift.date} · ${person.name}: Hinterlegte Dienstdauer-/Ruhegrenze überschritten.`)
  }
  for (const person of context.employees) {
    const proposed = shifts.filter(shift => shift.employeeId === person.id)
    if (proposed.length && workTime([...context.shifts, ...shifts].filter(shift => shift.employeeId === person.id && shift.date >= session.request.from && shift.date <= session.request.to)).net > person.weeklyMinutes) blockers.push(`${person.name}: Der Wochenumfang nach bisher bekannten Pausen überschreitet die Vertragsstunden. Ungeklärte Pausen zuerst manuell prüfen; kein exakter Netto-/Überstundenwert.`)
  }
  const draft: Draft = { context, proposal: { from: session.request.from, to: session.request.to, shifts, demands: [], reasons: answer.warnings, explanations: answer.shifts.map(item => `${item.person} · ${item.date}: ${item.reason}`) } }
  const issues = session.request.task !== 'late' ? pauseAwareIssues(proposalIssues(context, draft.proposal), { ...context, shifts: [...context.shifts, ...shifts] }, session.request.from, session.request.to) : []
  for (const shift of shifts) shiftWarnings(shift, [], context.events, context.employees).forEach((cause, index) => issues.push({ id: `ai-event:${shift.id}:${index}`, kind: 'hint', date: shift.date, person: shift.employeeName!, cause, correction: 'Sondertermin und geplante Arbeitszeit vor Übernahme bewusst prüfen.' }))
  return { session, answer, draft, blockers: [...new Set(blockers)], issues }
}
export function adoptAi(storage: StorageAccess, preview: AiPreview, confirmed = false) {
  if (!confirmed || preview.session.request.task !== 'plan') throw Error('Bitte die Übernahme des Planungsvorschlags ausdrücklich bestätigen.')
  assertAiCurrent(storage, preview.session)
  // Revalidate the untrusted response and deterministic rules immediately before the existing atomic write.
  const checked = aiPreview(preview.session, preview.answer)
  if (checked.blockers.length) throw Error('Nicht erfüllte Vorgaben verhindern die Übernahme. Bitte manuell planen oder einen neuen Vorschlag anfordern.')
  return adoptProposal({
    getItem: key => storage.getItem(key),
    setItem(key, value) {
      // Final guard also covers workspace/publication changes during deterministic revalidation.
      assertAiCurrent(storage, preview.session)
      storage.setItem(key, value)
    },
  }, checked.draft, {}, true)
}
export function localAnswerText(text: string, session: AiSession): string {
  return text.replace(/\b[PG][1-9][0-9]{0,2}\b/g, alias => {
    const id = [...(alias.startsWith('P') ? session.people : session.groups)].find(([, value]) => value === alias)?.[0]
    return alias.startsWith('P') ? session.context.employees.find(item => item.id === id)?.name ?? alias : session.context.setup?.groups.find(item => item.id === id)?.name ?? alias
  })
}
export function aiWeekLabel(session: AiSession) { return `${session.request.from} – ${session.request.to} · Zeiten HH:MM, Pausen neuer Dienste nicht festgelegt` }

// Reuse workTime, but never present its zero fallback as a confirmed pause/net duration.
export function aiTimeSummary(shifts: Shift[]) {
  const time = workTime(shifts), missing = shifts.filter(shift => shift.breakMinutes === undefined).length
  return { gross: time.gross, knownPause: time.pause, net: missing ? null : time.net, missing }
}
