import type { StorageAccess } from '../kita/setup'
import type { GeneratorContext } from './generator'
import { readGeneratorContext } from './generator'
import { checkPlan } from './checks'
import { calendarWeek, validateShift } from './schedule'
import type { Shift } from './schedule'

export const PUBLICATIONS_KEY = 'caro:published-weeks:v1'
export type TeamShift = Pick<Shift, 'id' | 'employeeId' | 'groupId' | 'date' | 'start' | 'end' | 'breakMinutes'>
export type TeamPlan = { kitaName: string; from: string; to: string; week: number; year: number; employees: { id: string; name: string }[]; groups: { id: string; name: string }[]; shifts: TeamShift[] }
export type PublishedPlan = TeamPlan & { version: number; publishedAt: string }
export type PublicationStore = { version: 1; plans: PublishedPlan[] }
export type PublicationToken = { date: string; source: (string | null)[]; publications: string | null }
// Explicit allowlist: no absence reasons, qualifications, preferences, contract hours, event notes or check results.
export function teamPlan(context: Pick<GeneratorContext, 'setup' | 'employees' | 'shifts'>, date: string): TeamPlan {
  const week = calendarWeek(date)
  const shifts = context.shifts.filter(shift => shift.date >= week.monday && shift.date <= week.days[6]).map(shift => ({ id: shift.id, employeeId: shift.employeeId, groupId: shift.groupId, date: shift.date, start: shift.start, end: shift.end, ...(shift.breakMinutes === undefined ? {} : { breakMinutes: shift.breakMinutes }) })).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
  const employees = [...new Set(shifts.map(shift => shift.employeeId))].sort().map(id => ({ id, name: context.employees.find(person => person.id === id)?.name ?? context.shifts.find(shift => shift.employeeId === id)?.employeeName ?? 'Name nicht hinterlegt' }))
  const groups = [...new Set(shifts.map(shift => shift.groupId))].sort().map(id => ({ id, name: context.setup?.groups.find(group => group.id === id)?.name ?? 'Gruppe nicht hinterlegt' }))
  return { kitaName: context.setup?.name ?? '', from: week.monday, to: week.days[6], week: week.week, year: week.year, employees, groups, shifts }
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function references(value: unknown): value is { id: string; name: string }[] { return Array.isArray(value) && value.every(item => record(item) && typeof item.id === 'string' && !!item.id.trim() && typeof item.name === 'string' && !!item.name.trim()) && new Set(value.map(item => item.id)).size === value.length }
function validSnapshot(value: unknown): value is PublishedPlan {
  if (!record(value) || typeof value.kitaName !== 'string' || typeof value.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.from) || !Number.isFinite(Date.parse(`${value.from}T00:00:00Z`)) || typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt)) || !Number.isSafeInteger(value.version) || Number(value.version) < 1 || !references(value.employees) || !references(value.groups) || !Array.isArray(value.shifts)) return false
  const week = calendarWeek(value.from)
  if (value.from !== week.monday || value.to !== week.days[6] || value.week !== week.week || value.year !== week.year) return false
  const employees = value.employees, groups = value.groups
  return value.shifts.every(shift => record(shift) && ['id','employeeId','groupId','date','start','end'].every(key => typeof shift[key] === 'string') && (shift.breakMinutes === undefined || typeof shift.breakMinutes === 'number') && !validateShift(shift as unknown as Shift).length && String(shift.date) >= week.monday && String(shift.date) <= week.days[6] && employees.some(person => person.id === shift.employeeId) && groups.some(group => group.id === shift.groupId)) && new Set(value.shifts.map(shift => shift.id)).size === value.shifts.length
}
export function loadPublications(storage: Pick<StorageAccess, 'getItem'>): PublicationStore {
  const raw = storage.getItem(PUBLICATIONS_KEY)
  if (raw === null) return { version: 1, plans: [] }
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.plans) || !value.plans.every(validSnapshot) || new Set(value.plans.map(plan => `${plan.from}:${plan.version}`)).size !== value.plans.length) throw Error('Gespeicherte Freigaben sind beschädigt oder haben eine unbekannte Version. Sie bleiben unverändert.')
  return value as PublicationStore
}
function content(plan: TeamPlan): string {
  return JSON.stringify({ kitaName: plan.kitaName, from: plan.from, to: plan.to, week: plan.week, year: plan.year, employees: plan.employees, groups: plan.groups, shifts: plan.shifts })
}
export function publicationStatus(plan: TeamPlan, publications: PublishedPlan[]): 'Entwurf' | 'Veröffentlicht' | 'Änderungen seit Veröffentlichung' {
  const last = publications.filter(item => item.from === plan.from).sort((a, b) => b.version - a.version)[0]
  return !last ? 'Entwurf' : content(plan) === content(last) ? 'Veröffentlicht' : 'Änderungen seit Veröffentlichung'
}
export function preparePublication(storage: StorageAccess, date: string): PublicationToken {
  const context = readGeneratorContext(storage)
  loadPublications(storage)
  return { date, source: context.snapshot, publications: storage.getItem(PUBLICATIONS_KEY) }
}
export function publishWeek(storage: StorageAccess, token: PublicationToken, confirmed = false, now = new Date().toISOString()): PublishedPlan {
  if (!confirmed) throw Error('Bitte die Veröffentlichung ausdrücklich bestätigen.')
  const context = readGeneratorContext(storage)
  const store = loadPublications(storage)
  if (JSON.stringify(context.snapshot) !== JSON.stringify(token.source) || storage.getItem(PUBLICATIONS_KEY) !== token.publications) throw Error('Daten oder Freigaben wurden inzwischen geändert. Bitte Freigabe erneut prüfen und bestätigen.')
  const plan = teamPlan(context, token.date)
  if (checkPlan({ from: plan.from, to: plan.to, setup: context.setup, employees: context.employees, absences: context.absences, inspection: { entries: context.shifts } }).some(issue => issue.kind === 'conflict')) throw Error('Harte Konflikte verhindern die Veröffentlichung. Bitte zuerst die Planprüfung korrigieren.')
  if (!Number.isFinite(Date.parse(now))) throw Error('Ungültiger Veröffentlichungszeitpunkt.')
  const version = 1 + Math.max(0, ...store.plans.filter(item => item.from === plan.from).map(item => item.version))
  const published: PublishedPlan = { ...plan, version, publishedAt: now }
  // All earlier versions are appended unchanged; working data is never written here.
  if (JSON.stringify(readGeneratorContext(storage).snapshot) !== JSON.stringify(token.source) || storage.getItem(PUBLICATIONS_KEY) !== token.publications) throw Error('Speicherstand geändert. Bitte Freigabe neu starten.')
  storage.setItem(PUBLICATIONS_KEY, JSON.stringify({ version: 1, plans: [...store.plans, published] }))
  return published
}
