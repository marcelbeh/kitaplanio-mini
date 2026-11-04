import { useState } from 'react'
import { appStorage } from '../../cloud/workspace'
import { WeekCopyPreview } from './WeekCopyPreview'
import { addDays } from './schedule'
import { adoptWeekCopy, prepareWeekCopy } from './copyWeek'
import type { WeekCopy } from './copyWeek'

type Props = { date: string; unavailable: boolean; onDone: (date: string, count: number, skipped: number) => void }
export function CopyWeekPanel({ date, unavailable, onDone }: Props) {
  const [open, setOpen] = useState(false), [source, setSource] = useState(date), [target, setTarget] = useState(() => addDays(date, 7))
  const [preview, setPreview] = useState<WeekCopy | null>(null), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('')
  function reset() { setPreview(null); setConfirmed(false); setError('') }
  return <section className="kita-card employee-page plan-checks" aria-label="Woche kopieren">
    <button className="kita-button secondary" disabled={unavailable} aria-expanded={open} onClick={() => { reset(); setOpen(!open) }}>Woche kopieren</button>
    {open && <>
      <p>Überträgt gespeicherte Schichten des aktuellen Arbeitsplans für alle Mitarbeitenden und Gruppen, unabhängig vom Ansichtsfilter. Keine Termine, Abwesenheiten oder Freigaben werden kopiert. Bestehende Zielschichten bleiben unverändert; veröffentlichte Zielwochen sind gesperrt.</p>
      <div className="employee-grid"><label>Datum in der Quellwoche<input type="date" min="0002-01-01" max="9998-12-31" value={source} onChange={event => { setSource(event.target.value); reset() }} /></label><label>Datum in der Zielwoche<input type="date" min="0002-01-01" max="9998-12-31" value={target} onChange={event => { setTarget(event.target.value); reset() }} /></label></div>
      <button className="kita-button secondary" onClick={() => { reset(); try { setPreview(prepareWeekCopy(appStorage, source, target)) } catch (error) { setError((error as Error).message) } }}>Kopiervorschau prüfen</button>
      {error && <p className="kita-errors" role="alert">{error}</p>}
      {preview && <WeekCopyPreview preview={preview} confirmed={confirmed} onConfirmed={setConfirmed} onApply={() => {
        try { const count = adoptWeekCopy(appStorage, preview, confirmed); setOpen(false); reset(); onDone(preview.target, count, preview.skipped.length) }
        catch (error) { setError((error as Error).message); setConfirmed(false) }
      }} onCancel={() => { setOpen(false); reset() }} />}
    </>}
  </section>
}
