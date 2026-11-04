// Shared by the browser and Edge Function: closed, bounded wire format; no free-form user input.
type Schema = { type?: string; properties?: Record<string, Schema>; items?: Schema; enum?: readonly unknown[]; anyOf?: Schema[]; minimum?: number; maximum?: number; maxItems?: number; maxLength?: number; pattern?: string; required?: string[]; additionalProperties?: boolean }
const str = (maxLength = 300): Schema => ({ type: 'string', maxLength })
const integer = (maximum = 1000000): Schema => ({ type: 'integer', minimum: 0, maximum })
const enumeration = (values: readonly string[]): Schema => ({ type: 'string', enum: values })
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: 'null' }] })
const array = (items: Schema, maxItems: number): Schema => ({ type: 'array', items, maxItems })
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const personId: Schema = { ...str(5), pattern: '^P[1-9][0-9]{0,2}$' }, groupId: Schema = { ...str(5), pattern: '^G[1-9][0-9]{0,2}$' }
const date: Schema = { ...str(10), pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, time: Schema = { ...str(5), pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' }
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const range = object({ start: time, end: time }), period = object({ start: time, end: time, minimum: nullable(integer(1000)) })
const shift = object({ person: personId, group: groupId, date, start: time, end: time, pause: nullable(integer(1440)) })
export const TASKS = ['plan', 'coverage', 'late', 'conflicts'] as const
export type Task = typeof TASKS[number]
export const requestSchema = object({
  version: { type: 'integer', enum: [1] }, task: enumeration(TASKS), from: date, to: date,
  people: array(object({ id: personId, group: groupId, weeklyMinutes: integer(10080), workdays: nullable(array(enumeration(days), 7)), availability: nullable(range),
    fixed: nullable(array(object({ day: enumeration(days), start: time, end: time }), 7)), wishDays: nullable(array(enumeration(days), 7)), wishHours: nullable(range),
    manualRules: nullable(array(object({ type: enumeration(['must', 'wish']), day: nullable(enumeration(days)) }), 100)) }), 100),
  groups: array(object({ id: groupId, periods: nullable(array(period, 50)) }), 30),
  settings: nullable(object({ completed: { type: 'boolean' }, careDays: array(enumeration(days), 7), opening: range, early: period, late: period,
    maxShiftMinutes: nullable(integer(10080)), minRestMinutes: nullable(integer(10080)) })),
  shifts: array(shift, 1500), baseline: array(shift, 160),
  absences: array(object({ person: personId, from: date, to: date, portion: enumeration(['full', 'am', 'pm']) }), 500),
  events: array(object({ date, start: time, end: time, people: array(personId, 100), groups: array(groupId, 30), wholeTeam: { type: 'boolean' } }), 500),
  coverage: array(object({ date, area: { ...str(10), pattern: '^(early|late|G[1-9][0-9]{0,2})$' }, start: integer(1440), end: integer(1440), required: nullable(integer(1000)), actual: integer(1000), possible: integer(1000), status: enumeration(['under', 'matched', 'over', 'check', 'unconfigured', 'closed', 'unspecified']) }), 2500),
  issues: array(object({ date, kind: enumeration(['conflict', 'hint']), code: enumeration(['overlap', 'absence', 'invalid', 'duplicate', 'person', 'group', 'availability', 'fixed', 'rest', 'hours', 'distribution', 'text', 'staff', 'demand', 'pause', 'half', 'long', 'other']) }), 1000),
  hours: array(object({ person: personId, net: nullable(integer()), early: nullable(integer()), core: nullable(integer()), late: nullable(integer()), weekend: nullable(integer()) }), 100),
})
export type AnonymousShift = { person: string; group: string; date: string; start: string; end: string; pause: number | null }
export type AiRequest = {
  version: 1; task: Task; from: string; to: string;
  people: { id: string; group: string; weeklyMinutes: number; workdays: string[] | null; availability: { start: string; end: string } | null; fixed: { day: string; start: string; end: string }[] | null; wishDays: string[] | null; wishHours: { start: string; end: string } | null; manualRules: { type: 'must' | 'wish'; day: string | null }[] | null }[];
  groups: { id: string; periods: { start: string; end: string; minimum: number | null }[] | null }[];
  settings: { completed: boolean; careDays: string[]; opening: { start: string; end: string }; early: { start: string; end: string; minimum: number | null }; late: { start: string; end: string; minimum: number | null }; maxShiftMinutes: number | null; minRestMinutes: number | null } | null;
  shifts: AnonymousShift[]; baseline: AnonymousShift[];
  absences: { person: string; from: string; to: string; portion: string }[];
  events: { date: string; start: string; end: string; people: string[]; groups: string[]; wholeTeam: boolean }[];
  coverage: { date: string; area: string; start: number; end: number; required: number | null; actual: number; possible: number; status: string }[];
  issues: { date: string; kind: string; code: string }[];
  hours: { person: string; net: number | null; early: number | null; core: number | null; late: number | null; weekend: number | null }[];
}
export type AiAnswer = { summary: string; warnings: string[]; shifts: { person: string; group: string; date: string; start: string; end: string; reason: string }[] }
export const answerSchema = object({ summary: str(2000), warnings: array(str(300), 12), shifts: array(object({ person: personId, group: groupId, date, start: time, end: time, reason: str(240) }), 160) })
export const MAX_INPUT_BYTES = 256000, MAX_OUTPUT_BYTES = 64000
function matches(value: unknown, schema: Schema): boolean {
  if (schema.anyOf) return schema.anyOf.some(item => matches(value, item))
  if (schema.enum && !schema.enum.includes(value)) return false
  if (schema.type === 'null') return value === null
  if (schema.type === 'boolean') return typeof value === 'boolean'
  if (schema.type === 'string') return typeof value === 'string' && value.length <= (schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(schema.pattern).test(value))
  if (schema.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity)
  if (schema.type === 'array') return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => matches(item, schema.items!))
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>, properties = schema.properties!
  return Object.keys(record).length === Object.keys(properties).length && Object.keys(properties).every(key => Object.hasOwn(record, key) && matches(record[key], properties[key]))
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length
function actualDate(value: string) { const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '0002-01-01' && value <= '9998-12-31' }
export function parseRequest(value: unknown): AiRequest {
  if (bytes(value) > MAX_INPUT_BYTES || !matches(value, requestSchema)) throw Error('Ungültige oder zu umfangreiche KI-Anfrage.')
  const request = value as AiRequest
  const people = new Set(request.people.map(person => person.id)), groups = new Set(request.groups.map(group => group.id))
  if (!actualDate(request.from) || !actualDate(request.to) || request.from > request.to || Date.parse(request.to) - Date.parse(request.from) > 31 * 86400000 || !people.size || !groups.size || people.size !== request.people.length || groups.size !== request.groups.length) throw Error('Ungültiger Zeitraum oder fehlende/eindeutige Stammdaten.')
  if (request.people.some(person => !groups.has(person.group)) || [...request.shifts, ...request.baseline].some(shift => !people.has(shift.person) || !groups.has(shift.group) || !actualDate(shift.date) || shift.start >= shift.end) || request.absences.some(item => !people.has(item.person) || !actualDate(item.from) || !actualDate(item.to) || item.from > item.to) || request.events.some(item => !actualDate(item.date) || item.people.some(id => !people.has(id)) || item.groups.some(id => !groups.has(id))) || request.hours.some(item => !people.has(item.person))) throw Error('KI-Anfrage enthält unbekannte Zuordnungen oder ungültige Zeiten.')
  return request
}
export function parseAnswer(value: unknown, request: AiRequest): AiAnswer {
  if (bytes(value) > MAX_OUTPUT_BYTES || !matches(value, answerSchema)) throw Error('Die KI-Antwort hat kein gültiges, begrenztes Format.')
  const answer = value as AiAnswer
  if (request.task !== 'plan' && answer.shifts.length || answer.shifts.some(shift => !request.people.some(person => person.id === shift.person) || !request.groups.some(group => group.id === shift.group) || !actualDate(shift.date) || shift.date < request.from || shift.date > request.to || shift.start >= shift.end || [0, 6].includes(new Date(`${shift.date}T00:00:00Z`).getUTCDay()))) throw Error('Die KI hat unbekannte Personen, Gruppen, Zeiten oder nicht freigegebene Dienste vorgeschlagen.')
  return answer
}
