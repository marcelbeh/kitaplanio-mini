import type { StorageAccess } from '../kita/setup'
import { ACTIVE_KEY } from '../../cloud/workspace'
import { readGeneratorContext } from './generator'
import { addDays, calendarWeek, overlappingShifts, validateShift, validDate } from './schedule'
import { adoptWeekCopy, preparePatternCopy } from './copyWeek'
import type { WeekCopy, WeekPattern } from './copyWeek'

export const TEMPLATES_KEY = 'caro:week-templates:v1'
export type WeekTemplate = { id: string; name: string; entries: WeekPattern[] }
export type TemplateStore = { version: 1; templates: WeekTemplate[] }
export type TemplatePreview = { id: string; name: string; raw: string | null; copy: WeekCopy }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
function name(value: string) { const next = value.trim(); if (!next || next.length > 100) throw Error('Bitte einen Vorlagennamen mit 1 bis 100 Zeichen eingeben.'); return next }
function validPattern(value: unknown): value is WeekPattern[] {
  if (!Array.isArray(value) || !value.length) return false
  const shifts = []
  for (const [index, entry] of value.entries()) {
    if (!record(entry) || !keys(entry, ['weekday','employeeId','groupId','start','end','breakMinutes']) || !Number.isInteger(entry.weekday) || Number(entry.weekday) < 0 || Number(entry.weekday) > 6 || !['employeeId','groupId','start','end'].every(key => typeof entry[key] === 'string') || entry.breakMinutes !== undefined && typeof entry.breakMinutes !== 'number') return false
    const shift = { id: `entry-${index}`, employeeId: String(entry.employeeId), groupId: String(entry.groupId), date: addDays('2000-01-03', Number(entry.weekday)), start: String(entry.start), end: String(entry.end), ...(entry.breakMinutes === undefined ? {} : { breakMinutes: Number(entry.breakMinutes) }) }
    if (validateShift(shift).length || overlappingShifts(shift, shifts).length) return false
    shifts.push(shift)
  }
  return true
}
export function loadTemplates(local: Pick<StorageAccess, 'getItem'>): TemplateStore {
  const raw = local.getItem(TEMPLATES_KEY)
  if (raw === null) return { version: 1, templates: [] }
  try {
    const value: unknown = JSON.parse(raw)
    if (!record(value) || !keys(value, ['version','templates']) || value.version !== 1 || !Array.isArray(value.templates) || !value.templates.every(item => record(item) && keys(item, ['id','name','entries']) && typeof item.id === 'string' && !!item.id.trim() && typeof item.name === 'string' && item.name === name(item.name) && validPattern(item.entries)) || new Set(value.templates.map(item => item.id)).size !== value.templates.length) throw Error()
    return value as TemplateStore
  } catch { throw Error('Lokale Vorlagen sind beschädigt oder haben eine unbekannte Version. Sie werden nicht überschrieben.') }
}
function read(local: StorageAccess) {
  const raw = local.getItem(TEMPLATES_KEY), store = loadTemplates(local)
  if (local.getItem(TEMPLATES_KEY) !== raw) throw Error('Vorlagen wurden inzwischen geändert. Bitte neu laden.')
  return { raw, store }
}
function write(local: StorageAccess, raw: string | null, store: TemplateStore) {
  const value = JSON.stringify(store); loadTemplates({ getItem: () => value })
  if (local.getItem(TEMPLATES_KEY) !== raw) throw Error('Vorlagen wurden inzwischen geändert. Bitte neu laden.')
  local.setItem(TEMPLATES_KEY, value)
  return store
}
export function saveWeekTemplate(local: StorageAccess, plan: StorageAccess, date: string, label: string, confirmed: boolean, id = crypto.randomUUID()): TemplateStore {
  if (!confirmed) throw Error('Bitte das Speichern der benannten Vorlage bestätigen.')
  if (!validDate(date)) throw Error('Ungültige Quellwoche.')
  const state = read(local), workspace = plan.getItem(ACTIVE_KEY), context = readGeneratorContext(plan), week = calendarWeek(date)
  if (!id.trim() || state.store.templates.some(item => item.id === id)) throw Error('Vorlagen-ID ist bereits vergeben oder ungültig.')
  const source = context.shifts.filter(shift => shift.date >= week.monday && shift.date <= week.days[6])
  if (!source.length) throw Error('Keine Schichten in dieser Woche zum Speichern vorhanden.')
  if (source.some(shift => !context.employees.some(person => person.id === shift.employeeId) || !context.setup?.groups.some(group => group.id === shift.groupId))) throw Error('Fehlende Personen/Gruppen in der Quellwoche. Bitte Zuordnungen zuerst prüfen.')
  const entries = source.map(shift => ({ employeeId: shift.employeeId, groupId: shift.groupId, weekday: week.days.indexOf(shift.date), start: shift.start, end: shift.end, ...(shift.breakMinutes === undefined ? {} : { breakMinutes: shift.breakMinutes }) }))
  if (!validPattern(entries)) throw Error('Die Quellwoche enthält ungültige oder überschneidende Schichten. Bitte zuerst korrigieren.')
  if (plan.getItem(ACTIVE_KEY) !== workspace || JSON.stringify(readGeneratorContext(plan).snapshot) !== JSON.stringify(context.snapshot)) throw Error('Arbeitsplan wurde inzwischen geändert. Bitte erneut prüfen.')
  return write(local, state.raw, { version: 1, templates: [...state.store.templates, { id, name: name(label), entries }] })
}
export function renameTemplate(local: StorageAccess, expected: WeekTemplate, label: string, confirmed: boolean) {
  if (!confirmed) throw Error('Bitte den neuen Vorlagennamen bestätigen.')
  const state = read(local), current = state.store.templates.find(item => item.id === expected.id)
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('Vorlage inzwischen geändert oder gelöscht. Bitte neu laden.')
  return write(local, state.raw, { version: 1, templates: state.store.templates.map(item => item.id === expected.id ? { ...item, name: name(label) } : item) })
}
export function deleteTemplate(local: StorageAccess, expected: WeekTemplate, confirmed: boolean) {
  if (!confirmed) throw Error('Bitte das Löschen der lokalen Vorlage ausdrücklich bestätigen.')
  const state = read(local), current = state.store.templates.find(item => item.id === expected.id)
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('Vorlage inzwischen geändert oder gelöscht. Bitte neu laden.')
  return write(local, state.raw, { version: 1, templates: state.store.templates.filter(item => item.id !== expected.id) })
}
export function prepareTemplate(local: StorageAccess, plan: StorageAccess, id: string, target: string): TemplatePreview {
  const state = read(local), template = state.store.templates.find(item => item.id === id)
  if (!template) throw Error('Lokale Vorlage nicht mehr vorhanden.')
  const copy = preparePatternCopy(plan, template.entries, target)
  if (local.getItem(TEMPLATES_KEY) !== state.raw) throw Error('Vorlagen wurden inzwischen geändert. Bitte neue Vorschau erstellen.')
  return { id, name: template.name, raw: state.raw, copy }
}
export function applyTemplate(local: StorageAccess, plan: StorageAccess, preview: TemplatePreview, confirmed: boolean) {
  const state = read(local), template = state.store.templates.find(item => item.id === preview.id)
  if (state.raw !== preview.raw || !template || template.name !== preview.name || JSON.stringify(template.entries) !== JSON.stringify(preview.copy.pattern)) throw Error('Vorlage wurde inzwischen geändert. Bitte neue Vorschau erstellen.')
  return adoptWeekCopy(plan, preview.copy, confirmed)
}
