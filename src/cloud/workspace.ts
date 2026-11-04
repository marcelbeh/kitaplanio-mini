import { AREAS, equal, preservePublications, validatePayload } from './dataset'
import type { Payload } from './dataset'

export const ACTIVE_KEY = 'caro:sync-active:v1'
export const CACHE_PREFIX = 'caro:sync-workspace:v1:'
export const WORKSPACE_EVENT = 'caro:workspace'
export const DIRTY_EVENT = 'caro:sync-dirty'
export type Workspace = { version: 1; owner: string; revision: number; base: Payload; local: Payload; lastSync: string; backup?: Payload }
const validOwner = (owner: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)
export function readWorkspace(storage: Pick<Storage, 'getItem'>, owner?: string): Workspace | null {
  const id = owner ?? storage.getItem(ACTIVE_KEY)
  if (!id) return null
  if (!validOwner(id)) throw Error('Ungültiger Cloud-Arbeitsbestand. Lokale Daten bleiben unverändert.')
  const raw = storage.getItem(CACHE_PREFIX + id)
  if (raw === null) { if (owner) return null; throw Error('Cloud-Arbeitsbestand fehlt. Bitte lokal weiterarbeiten.') }
  const value = JSON.parse(raw) as Workspace
  if (value.version !== 1 || value.owner !== id || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isFinite(Date.parse(value.lastSync))) throw Error('Cloud-Arbeitsbestand beschädigt. Er wurde nicht überschrieben.')
  validatePayload(value.base); validatePayload(value.local)
  if (value.backup) validatePayload(value.backup)
  return value
}
export function saveWorkspace(storage: Pick<Storage, 'setItem'>, workspace: Workspace) {
  // One localStorage operation commits the entire dataset and its sync baseline.
  storage.setItem(CACHE_PREFIX + workspace.owner, JSON.stringify(workspace))
}
export function createAppStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, notify: () => void = () => {}) {
  function change(key: string, value: unknown) {
    const workspace = readWorkspace(storage)
    if (!workspace || !AREAS.some(area => area === key)) return false
    const local = { ...workspace.local, [key]: value }
    // Existing model writers still validate their own area; rollback during the Kita interview remains possible.
    if (key === 'caro:published-weeks:v1') preservePublications(workspace.local, local)
    saveWorkspace(storage, { ...workspace, local }); notify(); return true
  }
  return {
    getItem(key: string) {
      if (AREAS.some(area => area === key)) {
        const workspace = readWorkspace(storage)
        if (workspace) return workspace.local[key] === null ? null : JSON.stringify(workspace.local[key])
      }
      return storage.getItem(key)
    },
    setItem(key: string, value: string) { if (!AREAS.some(area => area === key) || !change(key, JSON.parse(value))) storage.setItem(key, value) },
    removeItem(key: string) { if (!change(key, null)) storage.removeItem(key) },
  }
}
// Lazy access keeps model tests independent of the browser and reports storage failures to existing UI handlers.
export const appStorage = {
  getItem: (key: string) => createAppStorage(window.localStorage).getItem(key),
  setItem: (key: string, value: string) => createAppStorage(window.localStorage, () => window.dispatchEvent(new Event(DIRTY_EVENT))).setItem(key, value),
  removeItem: (key: string) => createAppStorage(window.localStorage, () => window.dispatchEvent(new Event(DIRTY_EVENT))).removeItem(key),
}
export function leaveWorkspace() {
  if (window.localStorage.getItem(ACTIVE_KEY) === null) return
  window.localStorage.removeItem(ACTIVE_KEY)
  window.dispatchEvent(new Event(WORKSPACE_EVENT))
}
export const isDirty = (workspace: Workspace) => !equal(workspace.local, workspace.base)
