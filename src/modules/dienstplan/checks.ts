import type { StorageAccess, KitaSetup, PlanningLimits } from '../kita/setup'
import type { Employee, Weekday } from '../mitarbeiter/employees'
import type { Absence } from '../abwesenheiten/absences'
import type { Shift } from './schedule'
import { SHIFTS_KEY, addDays, formatMinutes, validDate, validateShift, workTime } from './schedule'
import { wishMisses } from './fairness'
import type { SpecialDemand } from './staffing'
import { calculateStaffing, criticalWindows, isDefiniteShortage } from './staffing'

export type CheckOptions = PlanningLimits
export type PlanIssue = { id: string; kind: 'conflict' | 'hint'; date: string; person: string; cause: string; correction: string }
export type ShiftInspection = { entries: unknown[]; problem?: string }
export function inspectStoredShifts(storage: Pick<StorageAccess, 'getItem'>): ShiftInspection {
  try {
    const raw = storage.getItem(SHIFTS_KEY)
    if (raw === null) return { entries: [] }
    const value = JSON.parse(raw)
    if (!value || value.version !== 1 || !Array.isArray(value.shifts)) throw Error()
    return { entries: value.shifts }
  } catch { return { entries: [], problem: 'Schichtspeicher nicht lesbar oder Format/Version ungültig.' } }
}
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
const within = (date: string, from: string, to: string) => date >= from && date <= to
const positive = (value?: number) => value !== undefined && Number.isSafeInteger(value) && value > 0
const stamp = (shift: Shift, time: string) => Date.parse(`${shift.date}T00:00:00Z`) / 60000 + minute(time)
function shape(value: unknown): value is Shift {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return ['id', 'employeeId', 'groupId', 'date', 'start', 'end'].every(key => typeof record[key] === 'string') && (record.breakMinutes === undefined || typeof record.breakMinutes === 'number') && (record.employeeName === undefined || typeof record.employeeName === 'string')
}
export function checkPlan(input: { from: string; to: string; setup: KitaSetup | null; employees: Employee[]; absences: Absence[]; inspection: ShiftInspection; errors?: string[]; options?: CheckOptions; specialDemands?: SpecialDemand[] }): PlanIssue[] {
  const { from, to, setup, employees, absences, inspection, options = input.setup?.planningRules ?? {} } = input
  const issues = new Map<string, PlanIssue>()
  const add = (id: string, kind: PlanIssue['kind'], date: string, person: string, cause: string, correction: string) => issues.set(id, { id, kind, date, person, cause, correction })
  const name = (shift: Shift) => employees.find(person => person.id === shift.employeeId)?.name ?? shift.employeeName ?? `Person ${shift.employeeId}`
  const shifts: Shift[] = [], ids = new Set<string>()
  let invalid = !!inspection.problem
  if (inspection.problem) add('store', 'conflict', from, 'Dienstplan', inspection.problem, 'Speicher prüfen und ursprüngliche Daten wiederherstellen; es wurde nichts überschrieben.')
  inspection.entries.forEach((value, index) => {
    if (!shape(value) || validateShift(value).length) {
      invalid = true
      const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
      const knownDate = typeof raw.date === 'string' && validDate(raw.date)
      const date = knownDate ? raw.date as string : from
      const personName = employees.find(person => person.id === raw.employeeId)?.name ?? (typeof raw.employeeName === 'string' ? raw.employeeName : 'Person nicht ermittelbar')
      if (within(date, from, to)) add(`invalid:${index}`, 'conflict', date, personName, `${knownDate ? '' : 'Datum unbekannt; Zuordnung zur Prüfwoche nicht möglich. '}Fehlende oder ungültige Schichtdaten (Eintrag ${index + 1})${shape(value) ? ': ' + validateShift(value).join(' ') : '.'}`, 'Schichtdaten prüfen; unvollständige Zeit-, Personen-, Gruppen- oder Pausenangaben korrigieren.')
      return
    }
    if (ids.has(value.id)) { invalid = true; if (within(value.date, from, to)) add(`duplicate:${value.id}`, 'conflict', value.date, name(value), 'Schicht-ID ist mehrfach vergeben.', 'Doppelte Einträge prüfen und eindeutige Schichtdaten wiederherstellen.'); return }
    ids.add(value.id); shifts.push(value)
  })
  const sourceUnavailable = invalid || !!input.errors?.some(error => /^(Mitarbeiterdaten|Schichten|Abwesenheiten)/.test(error))
  for (const error of input.errors ?? []) if (!error.startsWith('Schichten') || !issues.size) add(`source:${error}`, 'hint', from, 'Dienstplan', error, 'Die Prüfung ist unvollständig. Datenquelle prüfen und neu laden.')
  const weekShifts = shifts.filter(shift => within(shift.date, from, to))
  for (const shift of weekShifts) {
    const person = employees.find(person => person.id === shift.employeeId)
    if (!person && !input.errors?.some(error => error.startsWith('Mitarbeiterdaten'))) add(`person:${shift.employeeId}`, 'conflict', shift.date, name(shift), 'Die Schicht verweist auf fehlende Mitarbeiter-Stammdaten.', 'Personenzuordnung und historische Schicht prüfen.')
    if (setup && !setup.groups.some(group => group.id === shift.groupId)) add(`group:${shift.id}`, 'conflict', shift.date, name(shift), 'Die eingetragene Gruppe ist nicht mehr vorhanden.', 'Gruppenzuordnung dieser Schicht prüfen.')
    const away = absences.filter(absence => absence.employeeId === shift.employeeId && absence.startDate <= shift.date && absence.endDate >= shift.date)
    if (away.some(absence => absence.portion === 'full')) add(`absence:${shift.employeeId}:${shift.date}`, 'conflict', shift.date, name(shift), 'Schicht trotz ganztägiger Abwesenheit.', 'Schicht oder Abwesenheit fachlich prüfen und bei Bedarf manuell korrigieren.')
    else if (away.length) add(`half:${shift.employeeId}:${shift.date}`, 'hint', shift.date, name(shift), 'Halbtägige Abwesenheit ohne genaue Uhrzeit: Anwesenheit ungeklärt.', 'Zeitliche Überschneidung manuell prüfen; kein pauschaler halber Tag wird abgezogen.')
    if (shift.breakMinutes === undefined) add(`missing-pause:${shift.employeeId}:${shift.date}`, 'hint', shift.date, name(shift), 'Pausendauer nicht vollständig erfasst; Nettozeit und Besetzung sind ungeklärt.', 'Pausendauer ausdrücklich prüfen und eintragen, auch 0 Minuten, falls tatsächlich keine Pause vorgesehen ist. Es wird keine Standardpause ergänzt.')
    if ((shift.breakMinutes ?? 0) > 0) add(`pause:${shift.id}`, 'hint', shift.date, name(shift), `${formatMinutes(shift.breakMinutes!)} Pause ohne zeitliche Zuordnung (${shift.start}–${shift.end}).`, 'Pausenlage im Team abstimmen; Nettozeit ist berechnet, Intervallbesetzung bleibt ungeklärt.')
    if (positive(options.maxShiftMinutes) && minute(shift.end) - minute(shift.start) > options.maxShiftMinutes!) add(`long:${shift.id}`, 'hint', shift.date, name(shift), `Bruttodienst ${formatMinutes(minute(shift.end) - minute(shift.start))} überschreitet die gewählte Grenze ${formatMinutes(options.maxShiftMinutes!)}.`, 'Dienstdauer prüfen. Dies ist ein frei gewählter Hinweis, keine rechtliche Bewertung.')
    if (!person) continue
    const wishes = wishMisses(person, shift.date, shift.start, shift.end)
    if (wishes.length) {
      const id = `wish:${person.id}:${shift.date}`
      const cause = [...new Set([...(issues.get(id)?.cause.split('; ') ?? []), ...wishes])].join('; ')
      add(id, 'hint', shift.date, person.name, cause, 'Wunsch und Bedarf abgleichen. Wünsche heben harte Regeln nicht auf.')
    }
    const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${shift.date}T00:00:00Z`).getUTCDay()]
    const fixed = person.fixedTimes[weekday as Weekday]
    if (!fixed && (shift.start < person.availability.start || shift.end > person.availability.end)) add(`availability:${shift.id}`, 'conflict', shift.date, person.name, `Schicht ${shift.start}–${shift.end} außerhalb des hinterlegten Arbeitsrahmens ${person.availability.start}–${person.availability.end}.`, 'Schichtzeiten oder ausdrücklich hinterlegte Verfügbarkeit prüfen.')
  }
  const checkedPeople = [...employees, ...[...new Set(shifts.map(shift => shift.employeeId))].filter(id => !employees.some(person => person.id === id)).map(id => ({ id, name: name(shifts.find(shift => shift.employeeId === id)!), weeklyMinutes: 0, fixedTimes: {} as Employee['fixedTimes'], rules: [] as Employee['rules'] }))]
  for (const person of checkedPeople) {
    const all = shifts.filter(shift => shift.employeeId === person.id).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
    const current = all.filter(shift => within(shift.date, from, to))
    // Compare each pair, not just neighbours: long shifts can overlap multiple short shifts.
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length && all[j].date === all[i].date; j++) {
      const a = all[i], b = all[j]
      if (within(a.date, from, to) && a.start < b.end && b.start < a.end) add(`overlap:${a.id}:${b.id}`, 'conflict', a.date, person.name, `Überschneidung ${a.start}–${a.end} und ${b.start}–${b.end}.`, 'Zeiten oder doppelte Einträge prüfen; Schichten werden nicht automatisch verschoben.')
    }
    let previous = all[0]
    if (positive(options.minRestMinutes)) for (let i = 1; i < all.length; i++) {
      const a = previous, b = all[i]
      const gap = stamp(b, b.start) - stamp(a, a.end)
      if (gap >= 0 && gap < options.minRestMinutes! && (within(a.date, from, to) || within(b.date, from, to))) add(`rest:${a.id}:${b.id}`, 'hint', within(b.date, from, to) ? b.date : a.date, person.name, `Ruheabstand ${formatMinutes(gap)} zwischen ${a.date} ${a.end} und ${b.date} ${b.start}; gewählte Grenze ${formatMinutes(options.minRestMinutes!)}.`, 'Dienste manuell prüfen. Berechnung nach Kalenderzeiten ohne Zeitzonen-/Rechtsregel.')
      if (stamp(b, b.end) > stamp(a, a.end)) previous = b
    }
    const perDay = new Map<string, Shift[]>()
    current.forEach(shift => perDay.set(shift.date, [...(perDay.get(shift.date) ?? []), shift]))
    for (const [date, entries] of perDay) {
      const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${date}T00:00:00Z`).getUTCDay()]
      const fixed = person.fixedTimes[weekday as Weekday]
      if (fixed && (entries[0].start !== fixed.start || entries.some(shift => shift.start < fixed.start || shift.end > fixed.end) || entries.reduce((end, shift) => shift.end > end ? shift.end : end, '') !== fixed.end)) add(`fixed:${person.id}:${date}`, 'conflict', date, person.name, `Dienstbeginn/-ende weicht von verbindlichen Tageszeiten ${fixed.start}–${fixed.end} ab.`, 'Die gespeicherten festen Tageszeiten oder die Schichten dieses Tages prüfen.')
    }
    if (!sourceUnavailable && current.every(shift => shift.breakMinutes !== undefined) && Number.isSafeInteger(person.weeklyMinutes) && person.weeklyMinutes > 0) {
      const net = workTime(current).net
      if (net !== person.weeklyMinutes) add(`hours:${person.id}`, 'hint', from, person.name, `Geplante Nettozeit Mo–So ${formatMinutes(net)}; vertraglich ${formatMinutes(person.weeklyMinutes)}.`, 'Wochenumfang einschließlich Wochenenddiensten prüfen; Abwesenheiten werden nicht als fiktive Arbeitszeit gutgeschrieben.')
      const daily = [...perDay.values()].map(entries => workTime(entries).net)
      if (daily.length > 1 && Math.min(...daily) !== Math.max(...daily)) add(`distribution:${person.id}`, 'hint', from, person.name, `Ungleichmäßige Tagesverteilung: ${formatMinutes(Math.min(...daily))} bis ${formatMinutes(Math.max(...daily))} netto an belegten Tagen.`, 'Prüfen, ob die Verteilung beabsichtigt ist. Es ist keine Gleichverteilungsregel hinterlegt.')
    }
    const rules = person.rules.filter(rule => rule.weekday === null || current.some(shift => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${shift.date}T00:00:00Z`).getUTCDay()] === rule.weekday))
    if (rules.length) add(`text:${person.id}`, 'hint', from, person.name, `Freitextregeln manuell prüfen: ${rules.map(rule => `${rule.type === 'must' ? 'Muss' : 'Wunsch'}: ${rule.description}`).join('; ')}`, 'Freitext wird nicht automatisch interpretiert; hinterlegte Regeln mit dem Plan abgleichen.')
  }
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const day = calculateStaffing(date, setup, shifts, absences, employees, sourceUnavailable, input.specialDemands)
    if (day.status === 'unconfigured' || day.status === 'unspecified' && weekShifts.some(shift => shift.date === date)) add(`demand:${date}`, 'hint', date, 'Betreuungsbereiche', day.status === 'unspecified' ? 'Bedarf für Wochenend-Sonderdienst nicht festgelegt.' : 'Soll-Besetzung nicht vollständig konfiguriert.', 'Konkrete Bedarfswerte fachlich festlegen; es werden keine Personalvorgaben erfunden.')
    for (const window of criticalWindows(day.windows)) {
      if (!sourceUnavailable && isDefiniteShortage(window)) add(`staff:${date}:${window.area}:${window.start}`, 'conflict', date, window.name, `${formatMinutes(window.start)}–${formatMinutes(window.end)}: Mindestbesetzung unterschritten (Soll ${window.required}, ${window.status === 'check' ? `höchstens ${window.possible} zugeordnet; Anwesenheit ungeklärt` : `Ist ${window.actual}`}).`, 'Besetzung dieses Bereichs oder ausdrücklich konfigurierte Sollvorgabe prüfen.')
    }
  }
  return [...issues.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'conflict' ? -1 : 1) || a.person.localeCompare(b.person, 'de') || a.id.localeCompare(b.id))
}
