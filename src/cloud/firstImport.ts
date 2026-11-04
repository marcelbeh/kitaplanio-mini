import { AREAS, equal, payloadStorage, validatePayload } from './dataset'
import type { Payload } from './dataset'
import { loadSetup } from '../modules/kita/setup'
import { EMPLOYEES_KEY } from '../modules/mitarbeiter/employees'
import { openWorkspace } from './sync'
import type { CloudRecord, SetupRemote, SyncStorage } from './sync'
import { ACTIVE_KEY, readWorkspace } from './workspace'

export type RawData = Record<string, string | null>
export type LocalBackup = { format: 'caro-local-backup'; version: 1; createdAt: string; owner: string; initializationId: string; raw: RawData }
export const AREA_NAMES = ['Kita, Gruppen und Regeln', 'Kita-Interview', 'Mitarbeitende und Wünsche', 'Schichten und Pausen', 'Abwesenheiten', 'Sondertermine', 'Veröffentlichte Wochenversionen']
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
export function captureLocal(storage: Pick<Storage, 'getItem'>): RawData {
  return Object.fromEntries(AREAS.map(key => [key, storage.getItem(key)]))
}
export function importPayload(raw: RawData): Payload {
  if (Object.keys(raw).length !== AREAS.length || !AREAS.every(key => Object.hasOwn(raw, key) && (raw[key] === null || typeof raw[key] === 'string'))) throw Error('Sicherung unvollständig. Kein Bereich darf fehlen.')
  let payload: Payload
  try {
    payload = validatePayload(Object.fromEntries(AREAS.map(key => {
      const value: unknown = raw[key] === null ? null : JSON.parse(raw[key]!)
      if (raw[key] !== null && value === null) throw Error('Invalid stored null')
      return [key, value]
    })))
  }
  catch { throw Error('Lokaler Datenbestand beschädigt oder unbekannte Version. Erstübernahme gesperrt; Rohdaten können unverändert gesichert werden.') }
  if (!loadSetup(payloadStorage(payload))?.completed || payload[EMPLOYEES_KEY] === null) throw Error('Kita-Einrichtung oder Mitarbeiterbereich fehlt bzw. ist unvollständig. Bitte zuerst lokal abschließen und speichern. Keine leere Cloud-Initialisierung.')
  return payload
}
export function areaPreview(raw: RawData) {
  const lists = ['groups', '', 'employees', 'shifts', 'absences', 'events', 'plans']
  return AREAS.map((key, index) => {
    if (raw[key] === null) return { name: AREA_NAMES[index], detail: 'Nicht vorhanden · bleibt ausdrücklich null' }
    try {
      const value = JSON.parse(raw[key]!)
      if (value?.version !== 1 || lists[index] && !Array.isArray(value[lists[index]])) return { name: AREA_NAMES[index], detail: 'Unbekanntes oder beschädigtes Format' }
      return { name: AREA_NAMES[index], detail: index === 0 ? `${value.groups.length} Gruppen · ${Object.keys(value.planningRules ?? {}).length} Planungsgrenzen` : `${lists[index] ? value[lists[index]].length : 1} Datensätze` }
    } catch { return { name: AREA_NAMES[index], detail: 'Beschädigt · Rohdaten bleiben im Backup' } }
  })
}
export function makeBackup(storage: Pick<Storage, 'getItem'>, owner: string, initializationId: string): LocalBackup {
  if (!uuid(owner) || !uuid(initializationId)) throw Error('Ungültige Konto- oder Sicherungskennung.')
  return { format: 'caro-local-backup', version: 1, createdAt: new Date().toISOString(), owner, initializationId, raw: captureLocal(storage) }
}
export function readBackup(text: string, owner: string): LocalBackup {
  let value: LocalBackup
  try { value = JSON.parse(text) } catch { throw Error('Die gewählte Datei ist keine lesbare caro.-Sicherung.') }
  if (!value || value.format !== 'caro-local-backup' || value.version !== 1 || value.owner !== owner || !uuid(value.initializationId) || (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) || !value.raw || typeof value.raw !== 'object' || Array.isArray(value.raw) || Object.keys(value.raw).length !== AREAS.length || !AREAS.every(key => Object.hasOwn(value.raw, key) && (value.raw[key] === null || typeof value.raw[key] === 'string'))) throw Error('Sicherung gehört nicht zu diesem Konto, ist unvollständig oder unbekannt.')
  return value
}
export function verifyBackupFile(text: string, expected: LocalBackup, storage: Pick<Storage, 'getItem'>): LocalBackup {
  const backup = readBackup(text, expected.owner)
  if (!equal(backup, expected) || !equal(captureLocal(storage), backup.raw)) throw Error('Sicherung oder lokale Daten stimmen nicht mit der Vorschau überein. Bitte neu prüfen und erneut sichern.')
  return backup
}
export function downloadBackup(backup: LocalBackup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `caro-backup-${backup.createdAt.replaceAll(':', '-')}-${backup.initializationId}.json`
  try { document.body.append(link); link.click() }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000) }
  // Browser download completion cannot be observed. Re-selecting and validating the saved file is mandatory.
}
function unchanged(storage: SyncStorage, backup: LocalBackup) {
  if (storage.getItem(ACTIVE_KEY) !== null || !equal(captureLocal(storage), backup.raw)) throw Error('Arbeitsbestand inzwischen geändert. Keine Aktivierung; ursprüngliche lokale Daten bleiben erhalten. Bitte neu prüfen und sichern.')
}
export async function firstImport(storage: SyncStorage, remote: SetupRemote, backup: LocalBackup, proof: LocalBackup | null, confirmed: boolean): Promise<CloudRecord> {
  if (!confirmed || !proof || !equal(backup, proof)) throw Error('Bitte heruntergeladene Sicherung erneut auswählen und die Erstübernahme ausdrücklich bestätigen.')
  const source = readBackup(JSON.stringify(backup), backup.owner), payload = importPayload(source.raw)
  unchanged(storage, source)
  const status = await remote.inspect()
  unchanged(storage, source)
  if (status.kind === 'occupied') throw Error('Cloud enthält bereits Daten. Erstübernahme gestoppt; keine Zusammenführung oder Überschreibung.')
  if (status.kind === 'ready' && status.initializationId !== source.initializationId) throw Error('Cloud ist bereits eingerichtet. Bitte vorhandenen Cloud-Bestand öffnen. Originaldaten bleiben erhalten.')
  if (status.kind === 'empty') {
    if (readWorkspace(storage, source.owner)) throw Error('Vorhandener Cloud-Zwischenspeicher. Keine Erstinitialisierung; bitte bestehenden Cloud-Bestand prüfen.')
    await remote.initialize(payload, source.initializationId)
  }
  // Also used after an unknown response: only the same backup token AND identical data can resume activation.
  const verified = await remote.inspect()
  unchanged(storage, source)
  if (verified.kind !== 'ready' || verified.initializationId !== source.initializationId || !equal(verified.record.payload, payload)) throw Error('Cloud-Rückprüfung stimmt nicht mit der Sicherung überein. Keine Aktivierung oder Erfolgsmeldung. Originaldaten und Backup bleiben erhalten; Stand erneut prüfen.')
  const cached = readWorkspace(storage, source.owner)
  if (cached && (cached.revision !== verified.record.revision || !equal(cached.local, payload) || !equal(cached.base, payload))) throw Error('Vorhandener Cloud-Zwischenspeicher weicht ab. Keine Aktivierung; bitte den Cloud-Bestand über P8b prüfen.')
  openWorkspace(storage, source.owner, verified.record, true)
  return verified.record
}
