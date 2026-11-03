import type { StorageAccess, TimeRange } from '../kita/setup'

export const DAYS = [
  { id: 'mon', label: 'Montag' }, { id: 'tue', label: 'Dienstag' },
  { id: 'wed', label: 'Mittwoch' }, { id: 'thu', label: 'Donnerstag' }, { id: 'fri', label: 'Freitag' },
] as const
export type Weekday = typeof DAYS[number]['id']
export type PlanningRule = { id: string; description: string; type: 'must' | 'wish'; weekday: Weekday | null }
export type Employee = {
  id: string
  name: string
  groupId: string
  qualification: string
  weeklyMinutes: number
  workdays: Weekday[]
  availability: TimeRange
  // These times are binding; breaks within them will be deducted by a future planner.
  fixedTimes: Partial<Record<Weekday, TimeRange>>
  rules: PlanningRule[]
}
export type EmployeeStore = { version: 1; employees: Employee[] }
export type GroupReference = { id: string; name: string }
export const EMPLOYEES_KEY = 'kitaplanio-lite:employees:v1'

export function newEmployee(id: string): Employee {
  return { id, name: '', groupId: '', qualification: '', weeklyMinutes: 0, workdays: [], availability: { start: '', end: '' }, fixedTimes: {}, rules: [] }
}
export function hoursToMinutes(value: string): number {
  const hours = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(hours)) return NaN
  const minutes = Number(hours) * 60
  return Number.isSafeInteger(Math.round(minutes)) && Math.abs(minutes - Math.round(minutes)) < 0.000001 ? Math.round(minutes) : NaN
}
export function formatHours(minutes: number): string {
  return (minutes / 60).toLocaleString('de-DE', { maximumFractionDigits: 6 })
}
function minutes(value: string): number {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN
}
function validRange(range: TimeRange): boolean { return Number.isFinite(minutes(range.start)) && Number.isFinite(minutes(range.end)) && minutes(range.end) > minutes(range.start) }
function isDay(day: unknown): day is Weekday { return DAYS.some(item => item.id === day) }

export function validateEmployee(employee: Employee, groups?: GroupReference[]): string[] {
  const errors: string[] = []
  if (!employee.id.trim()) errors.push('Die Mitarbeiter-ID fehlt.')
  if (!employee.name.trim()) errors.push('Bitte einen Namen eingeben.')
  if (!employee.qualification.trim()) errors.push('Bitte eine Qualifikation eingeben.')
  if (!employee.groupId || (groups && !groups.some(group => group.id === employee.groupId))) errors.push('Bitte eine vorhandene Stammgruppe aus der abgeschlossenen Kita-Einrichtung auswählen.')
  if (!Number.isSafeInteger(employee.weeklyMinutes) || employee.weeklyMinutes < 1) errors.push('Bitte positive vertragliche Wochenstunden mit höchstens minutengenauer Genauigkeit eingeben (z. B. 38,5).')
  if (!employee.workdays.length || employee.workdays.some(day => !isDay(day)) || new Set(employee.workdays).size !== employee.workdays.length) errors.push('Bitte mindestens einen regulären Arbeitstag von Montag bis Freitag auswählen.')
  if (!validRange(employee.availability)) errors.push('Arbeitsrahmen: Bitte gültigen frühesten Beginn und spätestes Ende eingeben. Ende muss nach Beginn liegen.')
  for (const [day, range] of Object.entries(employee.fixedTimes)) {
    const label = DAYS.find(item => item.id === day)?.label ?? day
    if (!isDay(day) || !employee.workdays.includes(day)) errors.push(`${label}: Feste Zeiten sind nur für reguläre Arbeitstage möglich.`)
    if (!validRange(range) || minutes(range.start) < minutes(employee.availability.start) || minutes(range.end) > minutes(employee.availability.end)) errors.push(`${label}: Feste Zeiten müssen gültig sein und innerhalb des Arbeitsrahmens liegen.`)
  }
  // Gross time is only an upper bound: comparing it as net work would wrongly reject contracts with unpaid breaks.
  if (validRange(employee.availability)) {
    const capacity = employee.workdays.reduce((total, day) => {
      const range = employee.fixedTimes[day] ?? employee.availability
      return total + minutes(range.end) - minutes(range.start)
    }, 0)
    if (Number.isFinite(capacity) && employee.weeklyMinutes > capacity) errors.push('Die Wochenstunden passen nicht in die gewählten Arbeitstage und Zeitfenster. Pausen sind dabei noch nicht abgezogen.')
  }
  if (new Set(employee.rules.map(rule => rule.id)).size !== employee.rules.length) errors.push('Planungsregeln benötigen eindeutige IDs.')
  for (const [index, rule] of employee.rules.entries()) {
    if (!rule.id.trim() || !rule.description.trim()) errors.push(`Regel ${index + 1}: Bitte eine Beschreibung eingeben.`)
    if (rule.type !== 'must' && rule.type !== 'wish') errors.push(`Regel ${index + 1}: Bitte „Verbindlich (Muss)“ oder „Wunsch“ auswählen.`)
    if (rule.weekday !== null && !isDay(rule.weekday)) errors.push(`Regel ${index + 1}: Bitte einen gültigen Wochentag auswählen.`)
  }
  return errors
}

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function range(value: unknown): value is TimeRange { return record(value) && typeof value.start === 'string' && typeof value.end === 'string' }
export function employeeShape(value: unknown): value is Employee {
  if (!record(value) || !['id', 'name', 'groupId', 'qualification'].every(key => typeof value[key] === 'string') || typeof value.weeklyMinutes !== 'number' || !Array.isArray(value.workdays) || !value.workdays.every(isDay) || !range(value.availability) || !record(value.fixedTimes) || !Object.values(value.fixedTimes).every(range) || !Array.isArray(value.rules)) return false
  return value.rules.every(rule => record(rule) && typeof rule.id === 'string' && typeof rule.description === 'string' && (rule.type === 'must' || rule.type === 'wish') && (rule.weekday === null || isDay(rule.weekday)))
}
export function loadEmployees(storage: StorageAccess): EmployeeStore {
  const raw = storage.getItem(EMPLOYEES_KEY)
  if (raw === null) return { version: 1, employees: [] }
  const value: unknown = JSON.parse(raw)
  if (!record(value) || value.version !== 1 || !Array.isArray(value.employees) || !value.employees.every(employeeShape) || value.employees.some(employee => validateEmployee(employee).length) || new Set(value.employees.map(employee => employee.id)).size !== value.employees.length) {
    throw new Error('Die gespeicherten Mitarbeiterdaten sind ungültig oder haben eine unbekannte Version. Sie wurden nicht überschrieben.')
  }
  return value as EmployeeStore
}
export function saveEmployee(storage: StorageAccess, employee: Employee, groups: GroupReference[], mode: 'create' | 'update'): EmployeeStore {
  if (!employeeShape(employee)) throw new Error('Die Mitarbeiterdaten haben ein ungültiges Format.')
  const errors = validateEmployee(employee, groups)
  if (errors.length) throw new Error(errors.join(' '))
  const store = loadEmployees(storage)
  const exists = store.employees.some(item => item.id === employee.id)
  if (mode === 'create' && exists) throw new Error('Diese Mitarbeiter-ID ist bereits vergeben.')
  if (mode === 'update' && !exists) throw new Error('Der Mitarbeiter wurde inzwischen entfernt. Bitte die Übersicht neu laden.')
  const normalized = { ...employee, name: employee.name.trim(), qualification: employee.qualification.trim(), rules: employee.rules.map(rule => ({ ...rule, description: rule.description.trim() })) }
  const next: EmployeeStore = { version: 1, employees: mode === 'create' ? [...store.employees, normalized] : store.employees.map(item => item.id === employee.id ? normalized : item) }
  storage.setItem(EMPLOYEES_KEY, JSON.stringify(next))
  return next
}
export function deleteEmployee(storage: StorageAccess, id: string): EmployeeStore {
  const store = loadEmployees(storage)
  if (!store.employees.some(employee => employee.id === id)) throw new Error('Der Mitarbeiter wurde bereits entfernt. Bitte die Übersicht neu laden.')
  const next: EmployeeStore = { version: 1, employees: store.employees.filter(employee => employee.id !== id) }
  storage.setItem(EMPLOYEES_KEY, JSON.stringify(next))
  return next
}
