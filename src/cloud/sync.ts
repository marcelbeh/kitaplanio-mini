import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyCloudAccess } from './access'
import { equal, preservePublications, validatePayload } from './dataset'
import type { Payload } from './dataset'
import { ACTIVE_KEY, isDirty, readWorkspace, saveWorkspace } from './workspace'
import type { Workspace } from './workspace'

export type CloudRecord = { revision: number; payload: Payload; updatedAt: string | null }
export type CloudStatus = { kind: 'empty' } | { kind: 'occupied' } | { kind: 'ready'; record: CloudRecord; initializationId: string | null }
export type SetupRemote = { inspect(): Promise<CloudStatus>; initialize(payload: Payload, initializationId: string): Promise<void> }
export type SyncRemote = { read(): Promise<CloudRecord>; cas(revision: number, payload: Payload): Promise<CloudRecord | null> }
export type Conflict = { remote: CloudRecord; local: Payload; revision: number }
export type SyncResult = { kind: 'synced' } | { kind: 'conflict'; conflict: Conflict }
export const PROVISIONING = 'Noch kein eingerichteter Cloud-Datenbestand. Bitte die ausdrücklich bestätigte Ersteinrichtung (P8c) mit lokaler Sicherung starten. Kein automatischer Upload.'
function cloudRecord(row: Record<string, unknown> | null): CloudRecord {
  if (!row || row.sync_initialized !== true) throw Error(PROVISIONING)
  if (row.format_version !== 1 || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0 || !(row.updated_at === null || typeof row.updated_at === 'string')) throw Error('Unbekannter Cloud-Versionsstand. Keine Daten geändert.')
  return { revision: Number(row.revision), payload: validatePayload(row.payload), updatedAt: row.updated_at as string | null }
}
export function supabaseRemote(client: SupabaseClient, owner: string): SyncRemote & SetupRemote {
  async function authorize() {
    const access = await verifyCloudAccess(client)
    if (!access.connected || access.userId !== owner) throw Error('Cloud-Sitzung oder Freigabe nicht bestätigt. Bitte erneut anmelden; lokal bleibt alles erhalten.')
  }
  async function inspect(): Promise<CloudStatus> {
    await authorize()
    const { data, error } = await client.from('caro_app_data').select('format_version,payload,revision,sync_initialized,updated_at,initialization_id').eq('owner_id', owner).maybeSingle()
    if (error) throw Error('Cloud konnte nicht gelesen werden. Verbindung und SQL-Migrationen prüfen; bitte manuell erneut versuchen.')
    if (!data) return { kind: 'empty' }
    if (data.sync_initialized === true) return { kind: 'ready', record: cloudRecord(data), initializationId: data.initialization_id }
    return data.format_version === 1 && data.sync_initialized === false && data.revision === 0 && data.updated_at === null && data.initialization_id === null && equal(data.payload, {}) ? { kind: 'empty' } : { kind: 'occupied' }
  }
  return {
    inspect,
    async initialize(payload, initializationId) {
      await authorize()
      const { error } = await client.rpc('caro_initialize', { p_payload: payload, p_initialization_id: initializationId })
      if (error) throw Error('Erstübernahme nicht bestätigt. Originaldaten und Backup bleiben erhalten. Über „Stand erneut prüfen“ mit derselben Sicherung fortsetzen; SQL-Migration und Verbindung prüfen.')
    },
    async read() {
      const status = await inspect()
      if (status.kind !== 'ready') throw Error(PROVISIONING)
      return status.record
    },
    async cas(revision, payload) {
      await authorize()
      const { data, error } = await client.rpc('caro_sync_cas', { p_expected_revision: revision, p_payload: payload })
      if (error) throw Error('Übertragung konnte nicht bestätigt werden. Keine Teilübertragung; bei unklarer Netzwerkantwort erneut synchronisieren. Unveränderliche Freigaben und P8b-Einrichtung prüfen.')
      return data?.length === 1 ? cloudRecord(data[0]) : null
    },
  }
}
export type SyncStorage = Pick<Storage, 'getItem' | 'setItem'>
function current(storage: SyncStorage, owner: string): Workspace {
  if (storage.getItem(ACTIVE_KEY) !== owner) throw Error('Arbeitsbestand inzwischen gewechselt. Bitte Synchronisierung neu starten.')
  const workspace = readWorkspace(storage, owner)
  if (!workspace) throw Error('Cloud-Arbeitsbestand fehlt.')
  return workspace
}
function sameBaseline(a: Workspace, b: Workspace) { return a.revision === b.revision && equal(a.base, b.base) }
const conflictFor = (workspace: Workspace, remote: CloudRecord): SyncResult => ({ kind: 'conflict', conflict: { remote, local: workspace.local, revision: workspace.revision } })
export function openWorkspace(storage: SyncStorage, owner: string, remote: CloudRecord, confirmed: boolean) {
  if (!confirmed) throw Error('Bitte Öffnen des Cloud-Arbeitsbestands bestätigen.')
  const cached = readWorkspace(storage, owner)
  // Never replace offline edits when reopening a cached workspace.
  if (!cached) saveWorkspace(storage, { version: 1, owner, revision: remote.revision, base: remote.payload, local: remote.payload, lastSync: new Date().toISOString() })
  storage.setItem(ACTIVE_KEY, owner)
}
async function upload(storage: SyncStorage, owner: string, remote: SyncRemote, source: Workspace, cloud: CloudRecord): Promise<SyncResult> {
  preservePublications(cloud.payload, source.local)
  const result = await remote.cas(cloud.revision, source.local)
  const latest = current(storage, owner)
  if (!sameBaseline(source, latest)) throw Error('Lokaler Versionsstand inzwischen geändert. Bitte erneut synchronisieren.')
  if (!result) return conflictFor(latest, await remote.read())
  if (!equal(result.payload, source.local) || result.revision !== cloud.revision + 1) throw Error('Unerwartete Cloud-Antwort. Bitte erneut prüfen.')
  // Edits made during the request remain dirty, rather than being lost on acknowledgement.
  saveWorkspace(storage, { ...latest, revision: result.revision, base: result.payload, lastSync: new Date().toISOString() })
  return { kind: 'synced' }
}
export async function synchronize(storage: SyncStorage, owner: string, remote: SyncRemote): Promise<SyncResult> {
  const before = current(storage, owner), cloud = await remote.read(), latest = current(storage, owner)
  if (!sameBaseline(before, latest)) throw Error('Synchronisierung läuft bereits in einem anderen Fenster. Bitte erneut prüfen.')
  if (cloud.revision === latest.revision && equal(cloud.payload, latest.base)) {
    if (isDirty(latest)) return upload(storage, owner, remote, latest, cloud)
  } else if (!equal(cloud.payload, latest.local)) return conflictFor(latest, cloud)
  // Also reconciles a successful upload whose network acknowledgement was lost.
  saveWorkspace(storage, { ...latest, revision: cloud.revision, base: cloud.payload, lastSync: new Date().toISOString() })
  return { kind: 'synced' }
}
export async function resolveConflict(storage: SyncStorage, owner: string, remote: SyncRemote, conflict: Conflict, choice: 'local' | 'cloud', confirmed: boolean): Promise<SyncResult> {
  if (!confirmed) throw Error('Bitte die gewählte Übernahme ausdrücklich bestätigen.')
  const cloud = await remote.read(), latest = current(storage, owner)
  if (cloud.revision !== conflict.remote.revision || !equal(cloud.payload, conflict.remote.payload) || latest.revision !== conflict.revision || !equal(latest.local, conflict.local)) return conflictFor(latest, cloud)
  if (choice === 'local') return upload(storage, owner, remote, latest, cloud)
  preservePublications(latest.local, cloud.payload)
  saveWorkspace(storage, { ...latest, revision: cloud.revision, base: cloud.payload, local: cloud.payload, backup: latest.local, lastSync: new Date().toISOString() })
  return { kind: 'synced' }
}
