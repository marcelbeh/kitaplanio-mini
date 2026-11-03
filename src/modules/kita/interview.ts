import { loadSetup, newSetup, saveSetup, STORAGE_KEY, validateSetup } from './setup'
import type { KitaSetup, StorageAccess } from './setup'
import { employeeShape, EMPLOYEES_KEY, hoursToMinutes, loadEmployees, saveEmployee, validateEmployee } from '../mitarbeiter/employees'
import type { Employee } from '../mitarbeiter/employees'

export const INTERVIEW_KEY = 'kitaplanio-lite:interview:v1'
export type MemberDraft = { employee: Employee; hours: string }
export type InterviewDraft = {
  version: 1; status: 'draft'; step: number; paused: boolean
  staffingArea?: string; groupCount: string; setup: KitaSetup; team: MemberDraft[]; activeMember: string | null
  baseSetup: string | null; baseTeam: string | null
}
export type InterviewState = InterviewDraft | { version: 1; status: 'completed' }
export const INTERVIEW_STEPS = ['Kita', 'Öffnungszeiten', 'Personalbedarf', 'Team', 'Arbeitsregeln', 'Abschluss']
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function startInterview(storage: StorageAccess): InterviewDraft {
  const baseSetup = storage.getItem(STORAGE_KEY), baseTeam = storage.getItem(EMPLOYEES_KEY)
  const snapshot = { getItem: (key: string) => key === STORAGE_KEY ? baseSetup : key === EMPLOYEES_KEY ? baseTeam : null, setItem() {} }
  const setup = loadSetup(snapshot)
  const employees = loadEmployees(snapshot).employees
  const blank = newSetup()
  // A displayed minimum must be an answer, never a prefilled staffing assumption.
  blank.careDays = []; blank.early.minimum = 0; blank.late.minimum = 0; blank.groups[0].periods[0].minimum = 0
  return { version: 1, status: 'draft', step: 0, paused: false, setup: setup ?? blank,
    staffingArea: 'early', groupCount: String((setup ?? blank).groups.length), team: employees.map(employee => ({ employee, hours: String(employee.weeklyMinutes / 60).replace('.', ',') })),
    activeMember: employees[0]?.id ?? null, baseSetup, baseTeam }
}
export function loadInterview(storage: StorageAccess): InterviewState | null {
  const raw = storage.getItem(INTERVIEW_KEY)
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (record(value) && value.version === 1 && value.status === 'completed') return { version: 1, status: 'completed' }
  if (!record(value) || value.version !== 1 || value.status !== 'draft' || !Number.isInteger(value.step) || Number(value.step) < 0 || Number(value.step) > 5 || typeof value.paused !== 'boolean' || typeof value.groupCount !== 'string' || !record(value.setup) || !Array.isArray(value.team) || !(value.activeMember === null || typeof value.activeMember === 'string') || !(value.baseSetup === null || typeof value.baseSetup === 'string') || !(value.baseTeam === null || typeof value.baseTeam === 'string')) throw new Error('Der Interview-Zwischenstand ist ungültig oder hat eine unbekannte Version. Er wurde nicht überschrieben.')
  // Reuse the Kita shape check, allowing incomplete answers even for an already completed Kita.
  loadSetup({ getItem: () => JSON.stringify({ ...value.setup as object, completed: false }), setItem() {} })
  if (!value.team.every(member => record(member) && employeeShape(member.employee) && typeof member.hours === 'string') || new Set(value.team.map(member => member.employee.id)).size !== value.team.length) throw new Error('Die Team-Antworten im Interview konnten nicht geladen werden.')
  return value as InterviewDraft
}
export function saveInterview(storage: StorageAccess, draft: InterviewDraft, restart = false): void {
  // Refuse to overwrite corrupt or future-version interview data.
  const previous = loadInterview(storage)
  if (previous?.status === 'completed' && !restart) throw new Error('Dieses Interview ist bereits abgeschlossen. Bitte die Bearbeitung ausdrücklich neu öffnen.')
  const serialized = JSON.stringify(draft)
  loadInterview({ getItem: () => serialized, setItem() {} })
  storage.setItem(INTERVIEW_KEY, serialized)
}
export function validateInterview(draft: InterviewDraft, step?: number): string[] {
  const errors = step === undefined || step < 3 ? validateSetup(draft.setup, step) : []
  if ((step === undefined || step === 0) && Number(draft.groupCount) !== draft.setup.groups.length) errors.push('Bitte die eingegebene Gruppenanzahl zuerst übernehmen.')
  if (step === undefined || step === 3 || step === 4) {
    if (!draft.team.length) errors.push('Bitte mindestens eine Person für dein Team erfassen.')
    for (const [i, member] of draft.team.entries()) {
      const employee = { ...member.employee, weeklyMinutes: hoursToMinutes(member.hours) }
      const label = employee.name.trim() || `Person ${i + 1}`
      if (step === 3) {
        if (!employee.name.trim()) errors.push(`${label}: Bitte einen Namen eingeben.`)
        if (!employee.qualification.trim()) errors.push(`${label}: Bitte die relevante Qualifikation eingeben.`)
        if (!draft.setup.groups.some(group => group.id === employee.groupId)) errors.push(`${label}: Bitte eine vorhandene Stammgruppe auswählen.`)
        if (!Number.isSafeInteger(employee.weeklyMinutes) || employee.weeklyMinutes < 1) errors.push(`${label}: Bitte positive Wochenstunden minutengenau eingeben.`)
      } else errors.push(...validateEmployee(employee, draft.setup.groups).map(error => `${label}: ${error}`))
    }
  }
  return errors
}
export function finishInterview(storage: StorageAccess & Pick<Storage, 'removeItem'>, draft: InterviewDraft): void {
  loadInterview(storage)
  const errors = validateInterview(draft)
  if (errors.length) throw new Error(errors.join(' '))
  if (storage.getItem(STORAGE_KEY) !== draft.baseSetup || storage.getItem(EMPLOYEES_KEY) !== draft.baseTeam) throw new Error('Stammdaten wurden seit Interviewbeginn geändert. Sie wurden nicht überschrieben. Bitte zuerst den aktuellen Stand neu einlesen.')
  const before = new Map([STORAGE_KEY, EMPLOYEES_KEY, INTERVIEW_KEY].map(key => [key, storage.getItem(key)]))
  const staged = new Map(before)
  const memory = { getItem: (key: string) => staged.get(key) ?? null, setItem: (key: string, value: string) => { staged.set(key, value) } }
  const setup = { ...draft.setup, completed: true }
  const previous = loadSetup(memory)
  if (JSON.stringify(setup) !== JSON.stringify(previous)) saveSetup(memory, setup, previous)
  const existing = loadEmployees(memory).employees
  for (const member of draft.team) {
    const employee = { ...member.employee, weeklyMinutes: hoursToMinutes(member.hours) }
    const old = existing.find(item => item.id === employee.id)
    if (JSON.stringify(employee) !== JSON.stringify(old)) saveEmployee(memory, employee, setup.groups, old ? 'update' : 'create')
  }
  staged.set(INTERVIEW_KEY, JSON.stringify({ version: 1, status: 'completed' }))
  const written: string[] = []
  try {
    for (const [key, value] of staged) if (value !== before.get(key) && value !== null) { storage.setItem(key, value); written.push(key) }
  } catch (error) {
    // Restore the exact previous values if a write fails; no partial success is reported.
    for (const key of written.reverse()) {
      const old = before.get(key)
      if (old === null || old === undefined) storage.removeItem(key)
      else storage.setItem(key, old)
    }
    throw error
  }
}

export function shouldStartInterview(storage: StorageAccess): boolean {
  const state = loadInterview(storage)
  return state?.status !== 'completed' && !(state?.status === 'draft' && state.paused) && !loadSetup(storage)?.completed
}
