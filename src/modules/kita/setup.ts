export type TimeRange = { start: string; end: string }
export type StaffingPeriod = TimeRange & { minimum: number }
export type KitaGroup = { id: string; name: string; periods: StaffingPeriod[] }
export type KitaSetup = {
  version: 1
  completed: boolean
  name?: string
  careDays?: ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[]
  pauseNotes?: string
  opening: TimeRange
  early: StaffingPeriod
  late: StaffingPeriod
  groups: KitaGroup[]
}
export type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>
export const STORAGE_KEY = 'kitaplanio-lite:kita:v1'
export const MAX_GROUPS = 100

export function newSetup(): KitaSetup {
  return {
    version: 1, completed: false,
    opening: { start: '', end: '' },
    early: { start: '', end: '', minimum: 1 },
    late: { start: '', end: '', minimum: 1 },
    groups: [{ id: 'group-1', name: '', periods: [{ start: '', end: '', minimum: 1 }] }],
  }
}

export function resizeGroups(setup: KitaSetup, count: number): KitaSetup {
  if (setup.completed) throw new Error('Die Gruppenanzahl ist nach der Einrichtung gesperrt.')
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_GROUPS) {
    throw new Error(`Bitte eine ganze Gruppenanzahl zwischen 1 und ${MAX_GROUPS} eingeben.`)
  }
  return { ...setup, groups: Array.from({ length: count }, (_, i) => setup.groups[i] ?? {
    id: `group-${i + 1}`, name: '', periods: [{ start: '', end: '', minimum: 1 }],
  }) }
}

function minutes(value: string): number {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN
}
function validRange(range: TimeRange): boolean {
  return Number.isFinite(minutes(range.start)) && Number.isFinite(minutes(range.end)) && minutes(range.start) < minutes(range.end)
}
function within(range: TimeRange, outer: TimeRange): boolean {
  return validRange(range) && minutes(range.start) >= minutes(outer.start) && minutes(range.end) <= minutes(outer.end)
}
function validMinimum(value: number): boolean { return Number.isSafeInteger(value) && value >= 1 }

// steps: 0 groups, 1 opening hours, 2 staffing; final validation checks all steps.
export function validateSetup(setup: KitaSetup, step?: number): string[] {
  const errors: string[] = []
  if ((step === undefined || step === 1) && setup.careDays !== undefined && (!setup.careDays.length || setup.careDays.some(day => !['mon', 'tue', 'wed', 'thu', 'fri'].includes(day)) || new Set(setup.careDays).size !== setup.careDays.length)) errors.push('Bitte mindestens einen Betreuungstag von Montag bis Freitag auswählen.')
  if (step === undefined || step === 0) {
    if (!setup.groups.length || setup.groups.length > MAX_GROUPS) errors.push('Bitte mindestens eine Gruppe anlegen (höchstens 100).')
    const names = setup.groups.map(group => group.name.trim().normalize('NFC').toLocaleLowerCase('de'))
    if (names.some(name => !name)) errors.push('Bitte jeder Gruppe einen Namen geben.')
    if (new Set(names).size !== names.length) errors.push('Gruppennamen müssen eindeutig sein – auch bei unterschiedlicher Großschreibung.')
  }
  if ((step === undefined || step === 1 || step === 2) && !validRange(setup.opening)) {
    errors.push('Öffnungszeiten: Bitte Beginn und Ende eingeben. Das Ende muss nach dem Beginn liegen.')
  }
  if (step === undefined || step === 2) {
    for (const [label, period] of [['Frühbetreuung', setup.early], ['Spätbetreuung', setup.late]] as const) {
      if (!within(period, setup.opening)) errors.push(`${label}: Beginn und Ende müssen innerhalb der Öffnungszeiten liegen; Ende nach Beginn.`)
      if (!validMinimum(period.minimum)) errors.push(`${label}: Die Mindestbesetzung muss eine ganze Zahl ab 1 sein.`)
    }
    if (setup.early.start !== setup.opening.start) errors.push('Die Frühbetreuung muss mit der Öffnung beginnen.')
    if (setup.late.end !== setup.opening.end) errors.push('Die Spätbetreuung muss mit der Schließung enden.')
    const core = { start: setup.early.end, end: setup.late.start }
    if (!validRange(core)) errors.push('Zwischen Früh- und Spätbetreuung muss eine Kernbetreuungszeit liegen.')
    for (const [index, group] of setup.groups.entries()) {
      const label = group.name.trim() || `Gruppe ${index + 1}`
      if (!group.periods.length) errors.push(`${label}: Bitte mindestens einen Zeitabschnitt für die Kernbetreuung erfassen.`)
      const sorted = [...group.periods].sort((a, b) => minutes(a.start) - minutes(b.start))
      for (const [i, period] of sorted.entries()) {
        if (!within(period, core) || !within(period, setup.opening)) errors.push(`${label}, Abschnitt ${i + 1}: Bitte gültige Zeiten innerhalb der Kernbetreuung eingeben.`)
        if (!validMinimum(period.minimum)) errors.push(`${label}, Abschnitt ${i + 1}: Die Mindestbesetzung muss eine ganze Zahl ab 1 sein.`)
        if (i > 0 && sorted[i - 1].end !== period.start) errors.push(`${label}: Zeitabschnitte müssen lückenlos aneinander anschließen und dürfen sich nicht überschneiden.`)
      }
      if (sorted.length && (sorted[0].start !== core.start || sorted[sorted.length - 1].end !== core.end)) {
        errors.push(`${label}: Die Zeitabschnitte müssen die gesamte Kernbetreuung abdecken (${core.start || '…'}–${core.end || '…'}).`)
      }
    }
  }
  return errors
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function isRange(value: unknown): value is TimeRange { return isRecord(value) && typeof value.start === 'string' && typeof value.end === 'string' }
function isPeriod(value: unknown): value is StaffingPeriod { return isRange(value) && 'minimum' in value && typeof value.minimum === 'number' && Number.isFinite(value.minimum) }
function isSetup(value: unknown): value is KitaSetup {
  if (!isRecord(value) || value.version !== 1 || typeof value.completed !== 'boolean' || !isRange(value.opening) || !isPeriod(value.early) || !isPeriod(value.late) || !Array.isArray(value.groups) || !value.groups.length || value.groups.length > MAX_GROUPS) return false
  if ((value.name !== undefined && typeof value.name !== 'string') || (value.pauseNotes !== undefined && typeof value.pauseNotes !== 'string') || (value.careDays !== undefined && (!Array.isArray(value.careDays) || !value.careDays.every(day => typeof day === 'string')))) return false
  return value.groups.every(group => isRecord(group) && typeof group.id === 'string' && typeof group.name === 'string' && Array.isArray(group.periods) && group.periods.every(isPeriod)) && new Set(value.groups.map(group => group.id)).size === value.groups.length
}

export function loadSetup(storage: StorageAccess): KitaSetup | null {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!isSetup(value) || (value.completed && validateSetup(value).length)) {
    throw new Error('Die gespeicherten Kita-Einstellungen sind ungültig oder haben eine unbekannte Version. Sie wurden nicht überschrieben.')
  }
  return value
}

export function saveSetup(storage: StorageAccess, setup: KitaSetup, previous: KitaSetup | null): KitaSetup {
  const stored = loadSetup(storage)
  const locked = stored?.completed ? stored : previous?.completed ? previous : null
  if (locked && (!setup.completed || locked.groups.length !== setup.groups.length || locked.groups.some((group, i) => group.id !== setup.groups[i]?.id))) {
    throw new Error('Die Einrichtung bleibt abgeschlossen. Gruppen können nicht hinzugefügt oder entfernt werden.')
  }
  if (!isSetup(setup)) throw new Error('Die Einstellungen haben ein ungültiges Datenformat.')
  if (setup.completed && validateSetup(setup).length) throw new Error('Bitte alle Pflichtangaben gültig ausfüllen, bevor du speicherst.')
  const normalized = { ...setup, groups: setup.groups.map(group => ({ ...group, name: group.name.trim() })) }
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
