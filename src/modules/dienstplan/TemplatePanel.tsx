import { useEffect, useState } from 'react'
import { appStorage } from '../../cloud/workspace'
import { addDays, calendarWeek, dateLabel } from './schedule'
import { WeekCopyPreview } from './WeekCopyPreview'
import { applyTemplate, deleteTemplate, loadTemplates, prepareTemplate, renameTemplate, saveWeekTemplate } from './templates'
import type { TemplatePreview, TemplateStore, WeekTemplate } from './templates'

function readLocal(): { store: TemplateStore | null; error: string } {
  try { return { store: loadTemplates(window.localStorage), error: '' } } catch (error) { return { store: null, error: (error as Error).message } }
}
type Props = { date: string; unavailable: boolean; onDone: (date: string, count: number, skipped: number) => void }
export function TemplatePanel({ date, unavailable, onDone }: Props) {
  const [state, setState] = useState(readLocal), [label, setLabel] = useState('')
  const [editing, setEditing] = useState<{ template: WeekTemplate; name: string } | null>(null), [deleting, setDeleting] = useState<WeekTemplate | null>(null)
  const [selected, setSelected] = useState(''), [target, setTarget] = useState(() => addDays(date, 7))
  const [preview, setPreview] = useState<TemplatePreview | null>(null), [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState('')
  useEffect(() => {
    const refresh = () => setState(readLocal())
    window.addEventListener('storage', refresh); window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  function run(action: () => TemplateStore, notice: string) {
    setError(''); setMessage('')
    try { setState({ store: action(), error: '' }); setEditing(null); setDeleting(null); setPreview(null); setConfirmed(false); setSelected(''); setMessage(notice); return true }
    catch (error) { setError((error as Error).message); return false }
  }
  const week = calendarWeek(date)
  return <section id="schedule-templates" tabIndex={-1} className="kita-card employee-page plan-checks" aria-label="Vorlagen">
    <h2>Vorlagen <span className="status">Nur auf diesem Gerät</span></h2>
    <p className="kita-help">Vorlagen bleiben ausschließlich in diesem Browser, auch bei aktivem Cloud-Arbeitsbereich. Kein Cloud-Upload und keine geräteübergreifende Synchronisierung der Vorlagen. Angewendete Schichten gehören anschließend zum ausgewählten Arbeitsplan.</p>
    {(state.error || error) && <p className="kita-errors" role="alert">{error || state.error}</p>}
    {message && <p className="kita-success" role="status">{message}</p>}
    {state.store && <>
      <details><summary>Aktuelle Woche als Vorlage speichern</summary>
        <p>KW {week.week}/{week.year} · {dateLabel(week.monday)}–{dateLabel(week.days[6])}. Alle gespeicherten Schichten aller Gruppen, unabhängig vom Ansichtsfilter. Nur Zuordnungen, Wochentage, Zeiten und Pausen; keine Abwesenheiten, Termine oder Freigaben. Vorhandene Wochenend-Schichten werden als ausdrücklicher Teil des Musters gespeichert.</p>
        <form onSubmit={event => { event.preventDefault(); if (run(() => saveWeekTemplate(window.localStorage, appStorage, date, label, true), 'Benannte Vorlage lokal gespeichert.')) setLabel(''); }}>
          <label>Name der Vorlage<input value={label} maxLength={100} required onChange={event => setLabel(event.target.value)} /></label>
          <button className="kita-button" type="submit" disabled={unavailable || !label.trim()}>Vorlage speichern</button>
        </form>
      </details>
      <h3>Gespeicherte Vorlagen ({state.store.templates.length})</h3>
      {!state.store.templates.length && <p>Noch keine lokalen Vorlagen. Speichere eine Woche mit vorhandenen Schichten.</p>}
      <ul className="plan-issues">{state.store.templates.map(template => <li className="employee-card" key={template.id}>
        <strong>{template.name}</strong><p className="kita-help">{template.entries.length} Schichten · davon {template.entries.filter(entry => entry.weekday >= 5).length} am Wochenende</p>
        {editing?.template.id === template.id ? <form onSubmit={event => { event.preventDefault(); run(() => renameTemplate(window.localStorage, editing.template, editing.name, true), 'Vorlage umbenannt.'); }}>
          <label>Neuer Vorlagenname<input value={editing.name} maxLength={100} required onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
          <div className="kita-actions"><button className="kita-button" type="submit" disabled={!editing.name.trim()}>Neuen Namen speichern</button><button type="button" className="kita-button secondary" onClick={() => setEditing(null)}>Abbrechen</button></div>
        </form> : <div className="kita-actions"><button className="kita-button secondary" disabled={unavailable} onClick={() => { setSelected(template.id); setPreview(null); setConfirmed(false); setError('') }}>Anwenden</button><button className="kita-button secondary" onClick={() => { setEditing({ template, name: template.name }); setDeleting(null) }}>Umbenennen</button><button className="kita-button secondary" onClick={() => { setDeleting(template); setEditing(null) }}>Löschen</button></div>}
        {deleting?.id === template.id && <div role="group" aria-label="Vorlage löschen bestätigen"><p>„{deleting.name}“ wirklich von diesem Gerät löschen? Arbeitsplan und Cloud-Bestände bleiben unverändert.</p><div className="kita-actions"><button className="kita-button" onClick={() => run(() => deleteTemplate(window.localStorage, deleting, true), 'Lokale Vorlage gelöscht.')}>Vorlage endgültig löschen</button><button className="kita-button secondary" onClick={() => setDeleting(null)}>Abbrechen</button></div></div>}
      </li>)}</ul>
      {!!selected && <div role="group" aria-label="Vorlage anwenden">
        <h3>{state.store.templates.find(item => item.id === selected)?.name ?? 'Vorlage nicht mehr vorhanden'}</h3>
        <label>Datum in der Zielwoche<input type="date" min="0002-01-01" max="9998-12-31" value={target} onChange={event => { setTarget(event.target.value); setPreview(null); setConfirmed(false) }} /></label>
        <button className="kita-button secondary" disabled={unavailable} onClick={() => {
          setError(''); setPreview(null); setConfirmed(false)
          try { setPreview(prepareTemplate(window.localStorage, appStorage, selected, target)) } catch (error) { setError((error as Error).message) }
        }}>Vorlagenvorschau prüfen</button>
        {preview && <WeekCopyPreview preview={preview.copy} sourceLabel={preview.name} applyLabel="Vorlage bestätigt anwenden" confirmed={confirmed} onConfirmed={setConfirmed} onCancel={() => { setPreview(null); setConfirmed(false) }} onApply={() => {
          try { const count = applyTemplate(window.localStorage, appStorage, preview, confirmed); setPreview(null); setConfirmed(false); setSelected(''); onDone(preview.copy.target, count, preview.copy.skipped.length) }
          catch (error) { setError((error as Error).message); setConfirmed(false) }
        }} />}
      </div>}
      <p className="kita-help">Vorlagen werden separat hier gelöscht. Der bisherige lokale Plan-Reset und Cloud-Datenübernahmen verändern diesen gerätelokalen Bereich nicht. Entfernte Personen/Gruppen werden beim Anwenden nicht automatisch ersetzt.</p>
    </>}
  </section>
}
