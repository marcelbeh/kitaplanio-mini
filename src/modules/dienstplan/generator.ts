import { loadSetup, STORAGE_KEY } from '../kita/setup'
import type { KitaSetup, StorageAccess } from '../kita/setup'
import { loadEmployees, EMPLOYEES_KEY } from '../mitarbeiter/employees'
import type { Employee, Weekday } from '../mitarbeiter/employees'
import { loadAbsences, ABSENCES_KEY } from '../abwesenheiten/absences'
import type { Absence } from '../abwesenheiten/absences'
import { loadEvents, EVENTS_KEY } from '../termine/events'
import type { Event } from '../termine/events'
import { loadShifts, SHIFTS_KEY, calendarWeek, formatMinutes, workTime, overlappingShifts, validateShift, validDate } from './schedule'
import type { Shift } from './schedule'
import { calculateStaffing, criticalWindows } from './staffing'
import type { SpecialDemand } from './staffing'
import { checkPlan } from './checks'
import type { CheckOptions } from './checks'

export type GeneratorContext = { setup: KitaSetup | null; employees: Employee[]; shifts: Shift[]; absences: Absence[]; events: Event[]; snapshot: (string | null)[] }
export type Proposal = { from: string; to: string; shifts: Shift[]; demands: SpecialDemand[]; reasons: string[] }
export type Draft = { context: GeneratorContext; proposal: Proposal }
const keys = [STORAGE_KEY, EMPLOYEES_KEY, SHIFTS_KEY, ABSENCES_KEY, EVENTS_KEY]
const snapshot = (storage: StorageAccess) => keys.map(key => storage.getItem(key))
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
export function readGeneratorContext(storage: StorageAccess): GeneratorContext {
  const before = snapshot(storage)
  const context = { setup: loadSetup(storage), employees: loadEmployees(storage).employees, shifts: loadShifts(storage), absences: loadAbsences(storage).absences, events: loadEvents(storage), snapshot: before }
  if (JSON.stringify(before) !== JSON.stringify(snapshot(storage))) throw Error('Daten wurden beim Lesen geändert. Bitte erneut vorschlagen.')
  return context
}
export function demandErrors(demands: SpecialDemand[], from: string, to: string, setup: KitaSetup | null): string[] {
  const errors: string[] = []
  for (const demand of demands) {
    const day = new Date(`${demand.date}T00:00:00Z`).getUTCDay()
    if (!validDate(demand.date) || demand.date < from || demand.date > to || ![0, 6].includes(day) || !setup?.groups.some(group => group.id === demand.groupId) || ![demand.start, demand.end].every(time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || demand.start >= demand.end || !Number.isSafeInteger(demand.minimum) || demand.minimum < 1) errors.push('Sonderbedarf benötigt Samstag/Sonntag dieser Woche, Gruppe, gültige Zeiten und einen ausdrücklich gewählten positiven Sollwert.')
  }
  if (demands.some((a, i) => demands.some((b, j) => j > i && a.date === b.date && a.groupId === b.groupId && a.start < b.end && b.start < a.end))) errors.push('Sonderbedarfe derselben Gruppe dürfen sich zeitlich nicht überschneiden.')
  return [...new Set(errors)]
}
export function proposalIssues(context: GeneratorContext, proposal: Proposal, options: CheckOptions = {}) {
  return checkPlan({ from: proposal.from, to: proposal.to, setup: context.setup, employees: context.employees, absences: context.absences, inspection: { entries: [...context.shifts, ...proposal.shifts] }, options, specialDemands: proposal.demands })
}
export function proposalCoverage(context: GeneratorContext, proposal: Proposal) {
  return calendarWeek(proposal.from).days.flatMap(date => criticalWindows(calculateStaffing(date, context.setup, [...context.shifts, ...proposal.shifts], context.absences, context.employees, false, proposal.demands).windows).filter(window => ['under', 'check', 'unconfigured'].includes(window.status)).map(window => ({ ...window, date })))
}
// Greedy, chronological, stable ID tie-break. Continue adjacent assignments before balancing weekly ratios.
export function generateProposal(context: GeneratorContext, date: string, demands: SpecialDemand[] = []): Proposal {
  const week = calendarWeek(date)
  const proposal: Proposal = { from: week.monday, to: week.days[6], shifts: [], demands: demands.map(demand => ({ ...demand })), reasons: [] }
  const reasons = new Set<string>(demandErrors(demands, proposal.from, proposal.to, context.setup))
  if (reasons.size || !context.setup?.completed) { reasons.add('Ohne vollständige Einrichtung bzw. gültigen Sonderbedarf werden keine Schichten erfunden.'); proposal.reasons = [...reasons]; return proposal }
  const setup = context.setup
  const combined = () => [...context.shifts, ...proposal.shifts]
  const weekly = (id: string) => workTime(combined().filter(shift => shift.employeeId === id && shift.date >= proposal.from && shift.date <= proposal.to)).net
  for (const day of week.days) {
    const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T00:00:00Z`).getUTCDay()]
    const weekend = weekday === 'sun' || weekday === 'sat'
    const staffing = calculateStaffing(day, setup, combined(), context.absences, context.employees, false, demands)
    if (staffing.status === 'unconfigured') reasons.add(`${day}: Sollvorgaben nicht vollständig konfiguriert.`)
    if (weekend && staffing.status === 'unspecified' && context.shifts.some(shift => shift.date === day)) reasons.add(`${day}: Vorhandener Sonderdienst bleibt unverändert; zusätzlicher Wochenendbedarf ist nicht festgelegt.`)
    for (const window of staffing.windows) {
      if (window.status === 'check') { reasons.add(`${day}: ${window.name} bleibt wegen unklarer Anwesenheit/Pausenlage manuell zu prüfen.`); continue }
      if (window.status !== 'under' || window.required === null) continue
      const ticks = [...new Set([window.start, window.end, ...context.employees.flatMap(person => [minute(person.availability.start), minute(person.availability.end)]).filter(point => point > window.start && point < window.end)])].sort((a, b) => a - b)
      for (let index = 0; index < ticks.length - 1; index++) {
        const start = ticks[index], end = ticks[index + 1]
        for (let missing = window.required - window.actual; missing > 0; missing--) {
          const candidates = context.employees.filter(person => {
            if (!setup.groups.some(group => group.id === person.groupId) || !Number.isSafeInteger(person.weeklyMinutes) || person.weeklyMinutes <= 0) return false
            if (window.area.startsWith('group:') && `group:${person.groupId}` !== window.area) return false
            if (!weekend && !person.workdays.includes(weekday as Weekday)) return false
            if (start < minute(person.availability.start) || end > minute(person.availability.end)) return false
            if (context.absences.some(absence => absence.employeeId === person.id && absence.startDate <= day && absence.endDate >= day)) { reasons.add(`${day}: ${person.name} hat eine Abwesenheit; unklare Halbtage werden nicht zeitlich geraten.`); return false }
            if (person.fixedTimes[weekday as Weekday]) { reasons.add(`${day}: Verbindliche feste Tageszeiten von ${person.name} müssen manuell als Ganzes eingeplant werden.`); return false }
            if (person.rules.some(rule => rule.type === 'must' && (rule.weekday === null || rule.weekday === weekday))) { reasons.add(`${day}: Muss-Freitextregel von ${person.name} ist nicht automatisch auswertbar.`); return false }
            if (weekly(person.id) + end - start > person.weeklyMinutes) return false
            return !overlappingShifts({ id: '', employeeId: person.id, groupId: person.groupId, date: day, start: formatMinutes(start), end: formatMinutes(end) }, combined()).length
          }).sort((a, b) => {
            const continuing = (id: string) => proposal.shifts.some(shift => shift.employeeId === id && shift.date === day && shift.end === formatMinutes(start)) ? 0 : 1
            return continuing(a.id) - continuing(b.id) || weekly(a.id) / a.weeklyMinutes - weekly(b.id) / b.weeklyMinutes || a.id.localeCompare(b.id)
          })
          const person = candidates[0]
          if (!person) { reasons.add(`${day}: ${window.name} kann mit Gruppen, Verfügbarkeiten und verbleibenden Vertragsstunden nicht vollständig besetzt werden.`); break }
          const groupId = window.area.startsWith('group:') ? window.area.slice(6) : person.groupId
          const previous = proposal.shifts.find(shift => shift.employeeId === person.id && shift.groupId === groupId && shift.date === day && shift.end === formatMinutes(start))
          if (previous) previous.end = formatMinutes(end)
          else {
            const baseId = `caro-draft:${day}:${person.id}:${groupId}:${start}`
            let id = baseId, suffix = 0
            while (combined().some(shift => shift.id === id)) id = `${baseId}:${++suffix}`
            proposal.shifts.push({ id, employeeId: person.id, employeeName: person.name, groupId, date: day, start: formatMinutes(start), end: formatMinutes(end) })
          }
        }
      }
    }
  }
  proposal.reasons = [...reasons]
  return proposal
}
export function adoptProposal(storage: StorageAccess, draft: Draft, options: CheckOptions = {}, confirmed = false): number {
  if (!confirmed) throw Error('Die Übernahme muss ausdrücklich bestätigt werden.')
  if (JSON.stringify(snapshot(storage)) !== JSON.stringify(draft.context.snapshot)) throw Error('Der Speicherstand wurde inzwischen geändert. Vorschlag verwerfen und neu erstellen; es wurde nichts gespeichert.')
  const current = readGeneratorContext(storage), proposal = draft.proposal
  const errors = demandErrors(proposal.demands, proposal.from, proposal.to, current.setup)
  if (errors.length) throw Error(errors.join(' '))
  if (!proposal.shifts.length) throw Error('Keine neuen Schichten zur Übernahme vorhanden.')
  for (const shift of proposal.shifts) {
    if (validateShift(shift).length || shift.date < proposal.from || shift.date > proposal.to || !current.employees.some(person => person.id === shift.employeeId) || !current.setup?.groups.some(group => group.id === shift.groupId)) throw Error('Vorgeschlagene Schichtdaten sind ungültig oder liegen außerhalb der gewählten Woche.')
  }
  if (proposalIssues(current, proposal, options).some(issue => issue.kind === 'conflict')) throw Error('Harte Konflikte verhindern die Übernahme. Bitte Vorschau und Prüfmeldungen korrigieren.')
  // One atomic localStorage operation, never saveShift in a loop. Failures preserve the old value.
  if (JSON.stringify(snapshot(storage)) !== JSON.stringify(draft.context.snapshot)) throw Error('Speicherstand geändert. Bitte Vorschlag neu erstellen.')
  storage.setItem(SHIFTS_KEY, JSON.stringify({ version: 1, shifts: [...current.shifts, ...proposal.shifts] }))
  return proposal.shifts.length
}
