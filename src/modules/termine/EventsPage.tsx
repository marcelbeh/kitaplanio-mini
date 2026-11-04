import { appStorage } from '../../cloud/workspace'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { loadSetup } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'
import { loadAbsences } from '../abwesenheiten/absences'
import { EVENT_TYPES, conflictHints, deleteEvent, listOccurrences, loadEvents, newEvent, saveEvent } from './events'
import type { Event } from './events'
import '../kita/kita.css'
import '../mitarbeiter/employees.css'
import '../abwesenheiten/absences.css'

function readInitial() {
  const storage = { getItem: (key: string) => appStorage.getItem(key), setItem: (key: string, value: string) => appStorage.setItem(key, value) }
  let events: Event[] = [], eventError = '', contextError = ''
  let employees: ReturnType<typeof loadEmployees>['employees'] = [], groups: NonNullable<ReturnType<typeof loadSetup>>['groups'] = [], absences: ReturnType<typeof loadAbsences>['absences'] = []
  try { events = loadEvents(storage) } catch { eventError = 'Termine konnten nicht geladen werden. Vorhandene Daten bleiben erhalten. Bitte Speicher prüfen und neu laden.' }
  try { employees = loadEmployees(storage).employees; groups = loadSetup(storage)?.groups ?? []; absences = loadAbsences(storage).absences } catch { contextError = 'Team-, Gruppen- oder Abwesenheitsdaten konnten nicht vollständig geladen werden. Auswahl und Überschneidungshinweise sind unvollständig. Bitte Speicher prüfen und neu laden.' }
  return { events, eventError, contextError, employees, groups, absences }
}
const dateLabel = (date: string) => date.split('-').reverse().join('.')
export function EventsPage() {
  const [initial] = useState(readInitial)
  const [events, setEvents] = useState(initial.events)
  const [editor, setEditor] = useState<{ value: Event; mode: 'create' | 'update' } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filters, setFilters] = useState({ from: '', to: '' })
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null), errorBox = useRef<HTMLParagraphElement>(null), deleteBox = useRef<HTMLDivElement>(null)
  useEffect(() => { if (editor) heading.current?.focus() }, [editor?.value.id])
  useEffect(() => { if (error) errorBox.current?.focus() }, [error])
  useEffect(() => { if (deleting) deleteBox.current?.focus() }, [deleting])
  const hints = (value: Event) => conflictHints(value, events, initial.absences, initial.employees)
  function open(value: Event, mode: 'create' | 'update') { setEditor({ value, mode }); setDeleting(null); setError(''); setNotice('') }
  function change(patch: Partial<Event>) { if (editor) setEditor({ ...editor, value: { ...editor.value, ...patch } }); setError('') }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor) return
    try { setEvents(saveEvent(appStorage, editor.value, editor.mode)); setEditor(null); setError(''); setNotice('Termin gespeichert.'); setFilters({ from: '', to: '' }) }
    catch (error) { setError((error as Error).message) }
  }
  const invalidFilter = filters.from && filters.to && filters.from > filters.to
  const visible = listOccurrences(events, filters.from, filters.to)
  const value = editor?.value
  const toggle = (key: 'employeeIds' | 'groupIds', id: string) => { if (value) change({ [key]: value[key].includes(id) ? value[key].filter(item => item !== id) : [...value[key], id] }) }
  const choices = (key: 'employeeIds' | 'groupIds') => {
    const current = key === 'employeeIds' ? initial.employees : initial.groups
    return [...current.map(item => ({ id: item.id, name: item.name })), ...(value?.[key] ?? []).filter(id => !current.some(item => item.id === id)).map(id => ({ id, name: `${id} (nicht mehr vorhanden)` }))]
  }
  return <div className="kita-setup employee-page absence-page">
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Sondertermine</h1><p>Termine für dein Team – einmalig oder wiederkehrend.</p></div>
    <p className="kita-local-note">Lokal in diesem Browser gespeichert · keine Synchronisierung. Für die spätere Dienstplanung vorbereitet.</p>
    {initial.eventError && <p role="alert" className="kita-errors">{initial.eventError}</p>}
    {initial.contextError && <p role="alert" className="absence-warning">{initial.contextError}</p>}
    {error && <p className="kita-errors" role="alert" ref={errorBox} tabIndex={-1}>{error}</p>}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {!initial.eventError && (value ? <>
      <h2 ref={heading} tabIndex={-1}>{editor?.mode === 'create' ? 'Termin hinzufügen' : 'Termin bearbeiten'}</h2>
      <form className="kita-card" noValidate onSubmit={submit}>
        <div className="employee-grid">
          <label>Titel<input required value={value.title} onChange={event => change({ title: event.target.value })} /></label>
          <label>Terminart<select value={value.type} onChange={event => change({ type: event.target.value as Event['type'] })}>{Object.entries(EVENT_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Datum<input required type="date" value={value.date} onChange={event => change({ date: event.target.value })} /></label>
          <label>Beginn<input required type="time" value={value.start} onChange={event => change({ start: event.target.value })} /></label>
          <label>Ende<input required type="time" value={value.end} onChange={event => change({ end: event.target.value })} /></label>
          <label>Wiederholung<select value={value.recurrence} onChange={event => change({ recurrence: event.target.value as Event['recurrence'] })}><option value="once">Einmalig</option><option value="weekly">Wöchentlich</option><option value="monthly">Monatlich</option></select></label>
          {value.recurrence !== 'once' && <label>Wiederholen bis einschließlich<input required type="date" min={value.date} value={value.until} onChange={event => change({ until: event.target.value })} /></label>}
        </div>
        {value.recurrence === 'monthly' && <p className="kita-help">Am gleichen Tag des Monats. Monate ohne diesen Tag werden übersprungen.</p>}
        {value.recurrence !== 'once' && <p className="kita-help">Bearbeiten und Löschen gelten für die gesamte Terminserie.</p>}
        <fieldset className="employee-days"><legend>Betroffene</legend>
          <label className="employee-check"><input type="checkbox" checked={value.wholeTeam} onChange={event => change({ wholeTeam: event.target.checked })} />Gesamtes Team</label>
          {!value.wholeTeam && <>{(['employeeIds', 'groupIds'] as const).map(key => <fieldset className="employee-days" key={key}><legend>{key === 'employeeIds' ? 'Mitarbeitende' : 'Gruppen'}</legend><div className="employee-day-options">{choices(key).map(item => <label className="employee-check" key={item.id}><input type="checkbox" checked={value[key].includes(item.id)} onChange={() => toggle(key, item.id)} />{item.name}</label>)}</div>{!choices(key).length && <p className="kita-help">Noch keine Einträge vorhanden.</p>}</fieldset>)}</>}
        </fieldset>
        <label>Notiz (optional)<textarea rows={3} value={value.note} onChange={event => change({ note: event.target.value })} /></label>
        {hints(value).length > 0 && <div className="absence-warning" role="status"><strong>Bitte prüfen – Speichern ist weiterhin möglich.</strong><ul>{hints(value).map((hint, i) => <li key={i}>{hint}</li>)}</ul></div>}
        <div className="kita-actions"><button className="kita-button" type="submit">Termin speichern</button><button className="kita-button secondary" type="button" onClick={() => { setEditor(null); setError('') }}>Abbrechen</button></div>
      </form>
    </> : <>
      <button className="kita-button" onClick={() => open(newEvent(crypto.randomUUID()), 'create')}>Termin hinzufügen</button>
      <section className="kita-card" aria-label="Termine filtern"><div className="employee-grid"><label>Zeitraum ab<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label><label>Zeitraum bis<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label></div><div className="kita-actions"><button className="kita-button secondary" onClick={() => setFilters({ from: '', to: '' })}>Filter zurücksetzen</button></div>{invalidFilter && <p className="absence-warning" role="status">Das Ende darf nicht vor dem Beginn liegen.</p>}</section>
      <p className="kita-help" role="status">{visible.length} Termine · chronologisch nach Beginn</p>
      {!visible.length && !invalidFilter && <section className="kita-card"><h2>Keine Termine im Zeitraum</h2><p>Füge einen Termin hinzu oder passe den Zeitraum an.</p></section>}
      <div className="absence-list">{visible.map(item => {
        const event = events.find(event => event.id === item.eventId)!
        const affected = event.wholeTeam ? 'Gesamtes Team' : [...event.employeeIds.map(id => initial.employees.find(person => person.id === id)?.name ?? `${id} (nicht mehr im Team)`), ...event.groupIds.map(id => initial.groups.find(group => group.id === id)?.name ?? `${id} (Gruppe nicht mehr vorhanden)`)].join(', ')
        return <article className="kita-card" key={`${event.id}:${item.date}`}><span className="status preview-status">{EVENT_TYPES[event.type]}</span><h2>{event.title}</h2><p>{dateLabel(item.date)} · {item.start}–{item.end}</p><p>{affected}</p>{event.recurrence !== 'once' && <p>{event.recurrence === 'weekly' ? 'Wöchentlich' : 'Monatlich'} bis {dateLabel(event.until)} · Änderungen gelten für die gesamte Serie</p>}{event.note && <p style={{ whiteSpace: 'pre-wrap' }}>{event.note}</p>}
          {hints({ ...event, date: item.date, recurrence: 'once', until: '' }).map((hint, i) => <p className="absence-warning" key={i}>{hint}</p>)}
          <div className="kita-actions"><button className="kita-button secondary" onClick={() => open(event, 'update')}>Bearbeiten<span className="employee-sr-only">: {event.title}, {dateLabel(item.date)}</span></button><button className="kita-button secondary" onClick={() => { setDeleting(`${event.id}:${item.date}`); setError(''); setNotice('') }}>Löschen<span className="employee-sr-only">: {event.title}, {dateLabel(item.date)}</span></button></div>
          {deleting === `${event.id}:${item.date}` && <div className="employee-delete" role="group" aria-label="Termin löschen bestätigen" tabIndex={-1} ref={deleteBox}><p>„{event.title}“{event.recurrence !== 'once' ? ' mit allen Wiederholungen' : ''} wirklich löschen?</p><div className="kita-actions"><button className="kita-button" onClick={() => { try { setEvents(deleteEvent(appStorage, event.id)); setDeleting(null); setError(''); setNotice('Termin gelöscht.') } catch (error) { setError((error as Error).message) } }}>Endgültig löschen</button><button className="kita-button secondary" onClick={() => setDeleting(null)}>Abbrechen</button></div></div>}
        </article>
      })}</div>
    </>)}
  </div>
}
