import { AREAS, equal } from '../../cloud/dataset'
import { ACTIVE_KEY } from '../../cloud/workspace'

export const RESET_PHRASE = 'LOKAL ZURÜCKSETZEN'
type ResetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type ResetBackup = { format: 'caro-local-reset-backup'; version: 1; createdAt: string; raw: Record<string, string | null> }
const snapshot = (storage: Pick<Storage, 'getItem'>) => Object.fromEntries(AREAS.map(key => [key, storage.getItem(key)]))
function requireLocal(storage: Pick<Storage, 'getItem'>) {
  if (storage.getItem(ACTIVE_KEY) !== null) throw Error('Reset gesperrt: zuerst im Cloud-Menü „Zu bisherigen lokalen Daten“ wählen. Cloud-Daten werden nicht zurückgesetzt.')
}
export function prepareReset(storage: Pick<Storage, 'getItem'>): ResetBackup {
  requireLocal(storage)
  return { format: 'caro-local-reset-backup', version: 1, createdAt: new Date().toISOString(), raw: snapshot(storage) }
}
export function verifyResetBackup(text: string, expected: ResetBackup): ResetBackup {
  let backup: unknown
  try { backup = JSON.parse(text) } catch { throw Error('Keine lesbare JSON-Sicherung ausgewählt.') }
  if (!equal(backup, expected)) throw Error('Die ausgewählte Datei stimmt nicht mit der vollständigen Reset-Sicherung überein.')
  return expected
}
export function resetLocalApp(storage: ResetStorage, backup: ResetBackup, proof: ResetBackup | null, phrase: string) {
  requireLocal(storage)
  if (phrase !== RESET_PHRASE || !proof || !equal(proof, backup)) throw Error('Bitte die gespeicherte Sicherung prüfen und den Reset eindeutig bestätigen.')
  if (backup.format !== 'caro-local-reset-backup' || backup.version !== 1 || !equal(snapshot(storage), backup.raw)) throw Error('Lokale Daten wurden inzwischen geändert. Bitte neue Vorschau und Sicherung erstellen.')
  const removed: string[] = []
  try {
    for (const key of AREAS) {
      requireLocal(storage)
      if (storage.getItem(key) !== backup.raw[key]) throw Error('Lokale Daten wurden während des Resets geändert.')
      if (backup.raw[key] !== null) { storage.removeItem(key); removed.push(key) }
    }
    requireLocal(storage)
    if (AREAS.some(key => storage.getItem(key) !== null)) throw Error('Reset konnte nicht vollständig geprüft werden.')
  } catch {
    let restored = true
    for (const key of removed.reverse()) {
      try {
        // Never overwrite concurrent edits made in another tab while restoring our removals.
        if (storage.getItem(key) !== null) { restored = false; continue }
        storage.setItem(key, backup.raw[key]!)
      } catch { restored = false }
    }
    throw Error(restored ? 'Reset abgebrochen. Entfernte lokale Werte wurden wiederhergestellt. Bitte erneut prüfen.' : 'Reset nicht vollständig ausführbar; Wiederherstellung teilweise blockiert. Nicht weiterbearbeiten. Die vollständigen Originalwerte stehen in deiner JSON-Sicherung.')
  }
}
