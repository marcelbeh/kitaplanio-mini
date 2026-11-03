import { useEffect, useState } from 'react'
import { loadSetup } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'
import { ABSENCE_TYPES, PORTIONS, loadAbsences } from '../abwesenheiten/absences'
import { EVENT_TYPES, listOccurrences, loadEvents } from '../termine/events'
import { addDays, calendarWeek, dateLabel, dayEntries, loadShifts, localDate, schedulePeople, validDate, formatMinutes, workTime, visibleScheduleDays } from './schedule'
import { calculateStaffing } from './staffing'
import { StaffingCard } from './StaffingCard'
import { ShiftEditor } from './ShiftEditor'
import type { Shift } from './schedule'
import type { SchedulePerson } from './schedule'
import '../kita/kita.css'
import './schedule.css'

function readSchedule() {
  const errors: string[] = []
  function read<T,>(label: string, load: () => T, fallback: T): T {
    try { return load() } catch { errors.push(`${label} konnten nicht geladen werden. Die Anzeige ist unvollständig. Vorhandene Daten bleiben erhalten; bitte Speicher prüfen und neu laden.`); return fallback }
  }
  const setup = read('Kita-Einstellungen', () => loadSetup(window.localStorage), null)
  return {
    setup,
    employees: read('Mitarbeiterdaten', () => loadEmployees(window.localStorage).employees, []),
    groups: setup?.groups ?? [],
    absences: read('Abwesenheiten', () => loadAbsences(window.localStorage).absences, []),
    events: read('Sondertermine', () => loadEvents(window.localStorage), []),
    shifts: read('Schichten', () => loadShifts(window.localStorage), []), errors,
  }
}
export function SchedulePage() {
  const [data, setData] = useState(readSchedule)
  const [today, setToday] = useState(localDate)
  const [selected, setSelected] = useState(localDate)
  const [dateError, setDateError] = useState('')
  const [editor, setEditor] = useState<{ value: Shift; mode: 'create' | 'update' } | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60_000)
    const reload = () => { setData(readSchedule()); setToday(localDate()) }
    window.addEventListener('storage', reload)
    window.addEventListener('focus', reload)
    return () => { window.clearInterval(timer); window.removeEventListener('storage', reload); window.removeEventListener('focus', reload) }
  }, [])
  const week = calendarWeek(selected)
  const people = schedulePeople(data.employees, data.shifts, data.absences, week.monday, week.days[6])
  const occurrences = listOccurrences(data.events, week.monday, week.days[6])
  const staffing = (date: string) => calculateStaffing(date, data.setup, data.shifts, data.absences, data.employees, data.errors.some(error => /^(Mitarbeiterdaten|Schichten|Abwesenheiten)/.test(error)))
  const days = visibleScheduleDays(week.days, selected, data.shifts, data.absences, occurrences.map(item => item.date))
  const group = (id: string) => data.groups.find(group => group.id === id)?.name ?? (id ? 'Gruppe nicht mehr verfügbar' : 'Keine Gruppe zugeordnet')
  const tone = (id: string) => Math.max(0, data.groups.findIndex(group => group.id === id)) % 4
  function select(date: string) {
    // Keep navigation and ISO arithmetic in the supported four-digit year range.
    if (!validDate(date) || date < '0002-01-01' || date > '9998-12-31') { setDateError('Bitte ein gültiges Datum zwischen 0002 und 9998 auswählen.'); return }
    setSelected(date); setDateError('')
  }
  const shiftsUnavailable = data.errors.some(error => error.startsWith('Schichten'))
  function openShift(person: SchedulePerson, date: string) {
    setNotice('')
    setEditor({ value: { id: crypto.randomUUID(), employeeId: person.id, employeeName: person.name, groupId: person.groupId, date, start: '', end: '' }, mode: 'create' })
  }
  function closeEditor() {
    setEditor(null)
    window.requestAnimationFrame(() => document.getElementById('page-title')?.focus())
  }
  function weeklySummary(person: SchedulePerson) {
    const totals = workTime(data.shifts.filter(shift => shift.employeeId === person.id && shift.date >= week.monday && shift.date <= week.days[6]))
    return <small className="schedule-week-total">Woche (Mo–So): {formatMinutes(totals.net)} netto</small>
  }
  function personDetails(person: SchedulePerson, date: string) {
    const entries = dayEntries(person.id, date, data.shifts, data.absences)
    const total = workTime(entries.shifts)
    return <div className="schedule-details">
      {entries.shifts.map(shift => <div className="schedule-shift" key={shift.id}><strong>{shift.start}–{shift.end}</strong><span className="schedule-group" data-tone={tone(shift.groupId)}>{group(shift.groupId)}</span><small>Brutto {formatMinutes(workTime([shift]).gross)} · Pause {shift.breakMinutes === undefined ? 'nicht erfasst' : formatMinutes(shift.breakMinutes)} · Netto {formatMinutes(workTime([shift]).net)}</small><button className="schedule-edit" disabled={shiftsUnavailable} onClick={() => { setNotice(''); setEditor({ value: shift, mode: 'update' }) }}>Bearbeiten<span className="schedule-sr-only">: {person.name}, {dateLabel(date)}, {shift.start}–{shift.end}</span></button></div>)}
      {!entries.shifts.length && <><span className="schedule-empty">Keine Schicht eingetragen</span><span className="schedule-group" data-tone={tone(person.groupId)}>{group(person.groupId)}</span></>}
      {!!entries.shifts.length && <small className="schedule-day-total">Tag: {formatMinutes(total.net)} netto</small>}
      <button className="schedule-add" disabled={shiftsUnavailable || !!person.historical} onClick={() => openShift(person, date)}>+ Schicht<span className="schedule-sr-only"> für {person.name}, {dateLabel(date)}</span></button>
      {entries.absences.map(absence => <div className="schedule-absence" key={absence.id}><strong>{ABSENCE_TYPES[absence.type]}</strong><small>{PORTIONS[absence.portion]}</small></div>)}
    </div>
  }
  function eventsForDay(date: string) {
    const entries = occurrences.filter(item => item.date === date)
    return <div className="schedule-events">{!entries.length && <span className="schedule-empty">Keine Sondertermine</span>}{entries.map(item => {
      const event = data.events.find(event => event.id === item.eventId)!
      const affected = event.wholeTeam ? 'Gesamtes Team' : [...event.groupIds.map(group), ...event.employeeIds.map(id => data.employees.find(person => person.id === id)?.name ?? 'Teammitglied nicht mehr verfügbar')].join(', ')
      return <a href="#termine" key={event.id} className="schedule-event"><small>{EVENT_TYPES[event.type]}</small><strong>{item.start}–{item.end} · {event.title}</strong><span>{affected}</span>{event.note && <span className="schedule-note">{event.note}</span>}</a>
    })}</div>
  }
  return <div className="kita-setup schedule-page">
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Dienstplan</h1><p>Deine Woche im Überblick – Schichten, Abwesenheiten und Sondertermine.</p></div>
    <p className="kita-local-note">Gespeicherte Daten aus diesem Browser. Schichten und Pausen werden lokal gespeichert. Arbeitszeiten werden ohne automatische Pausenabzüge berechnet.</p>
    {data.errors.map(error => <p className="kita-errors" role="alert" key={error}>{error}</p>)}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {editor ? <ShiftEditor key={editor.value.id} initial={editor.value} mode={editor.mode} data={data} onCancel={closeEditor} onDone={(date, message) => { setData(readSchedule()); select(date); setNotice(message); closeEditor() }} /> : <>
    <section className="kita-card schedule-controls" aria-label="Dienstplan-Zeitraum">
      <div className="schedule-week-title" role="status"><h2>KW {week.week} · {week.year}</h2><p>{dateLabel(week.monday)}–{dateLabel(days[days.length - 1])}</p></div>
      <div className="schedule-week-nav" aria-label="Wochennavigation"><button className="kita-button secondary" onClick={() => select(addDays(selected, -7))} aria-label="Vorherige Kalenderwoche">← Woche</button><button className="kita-button secondary" onClick={() => { const now = localDate(); setToday(now); select(now) }}>Heute</button><button className="kita-button secondary" onClick={() => select(addDays(selected, 7))} aria-label="Nächste Kalenderwoche">Woche →</button></div>
      <label>Datum / Kalenderwoche auswählen<input type="date" min="0002-01-01" max="9998-12-31" value={selected} onChange={event => select(event.target.value)} /></label>
      <p className="kita-help">Wähle ein Datum, um die zugehörige Kalenderwoche zu öffnen.</p>
      {dateError && <p className="kita-errors" role="alert">{dateError}</p>}
    </section>
    {!data.employees.length && !data.errors.length && <section className="kita-card"><h2>Dein Team fehlt noch</h2><p>Lege zuerst Mitarbeitende an. Bereits gespeicherte Einträge bleiben sichtbar.</p><a className="kita-button secondary" href="#mitarbeiter">Zum Team</a></section>}
    {!shiftsUnavailable && !data.shifts.some(shift => shift.date >= week.monday && shift.date <= week.days[6]) && <p className="kita-help">Für diese Woche sind keine Schichten eingetragen. Abwesenheiten und Sondertermine siehst du unabhängig davon.</p>}
    <div className="schedule-legend" aria-label="Legende"><span className="schedule-group" data-tone="0">Gruppe</span><span className="schedule-absence">Abwesenheit</span><span className="schedule-event">Sondertermin</span></div>
    <div className="schedule-desktop">
      <p id="schedule-scroll-help" className="kita-help">{days.length > 5 ? 'Montag bis Sonntag · Wochenend-Sonderdienste' : 'Montag bis Freitag'} · Das Raster lässt sich bei Bedarf seitlich und nach unten scrollen. Namen und Tagesüberschriften bleiben sichtbar.</p>
      <div className="schedule-scroll" role="region" aria-label="Wochenraster Dienstplan" aria-describedby="schedule-scroll-help" tabIndex={0}>
        <table className="schedule-table" style={days.length > 5 ? { minWidth: 1240 } : undefined}><caption className="schedule-sr-only">Dienstplan KW {week.week}, {week.year}</caption><thead><tr><th scope="col">Mitarbeitende</th>{days.map(date => <th scope="col" key={date} aria-current={date === today ? 'date' : undefined}>{dateLabel(date, true)}{date === today && <span className="schedule-today">Heute</span>}</th>)}</tr></thead><tbody>
          <tr><th scope="row">Personalbedarf</th>{days.map(date => <td key={date}><StaffingCard day={staffing(date)} /></td>)}</tr>
          <tr className="schedule-event-row"><th scope="row">Sondertermine</th>{days.map(date => <td key={date}>{eventsForDay(date)}</td>)}</tr>
          {people.map(person => <tr key={person.id}><th scope="row">{person.name}{weeklySummary(person)}{person.historical && <small>Nicht mehr im Team</small>}</th>{days.map(date => <td key={date}>{personDetails(person, date)}</td>)}</tr>)}
        </tbody></table>
      </div>
    </div>
    <section className="schedule-mobile" aria-label="Tagesansicht">
      <div className="schedule-day-nav"><button className="kita-button secondary" aria-label="Vorheriger Tag" onClick={() => select(addDays(selected, -1))}>←</button><h2 aria-live="polite">{dateLabel(selected, true)}{selected === today && <span className="schedule-today">Heute</span>}</h2><button className="kita-button secondary" aria-label="Nächster Tag" onClick={() => select(addDays(selected, 1))}>→</button></div>
      <section className="kita-card"><h3>Personalbedarf</h3><StaffingCard day={staffing(selected)} /></section>
      <section className="kita-card"><h3>Sondertermine</h3>{eventsForDay(selected)}</section>
      <div className="schedule-day-cards">{people.map(person => <article className="kita-card" key={person.id}><h3>{person.name}</h3>{weeklySummary(person)}{person.historical && <p className="kita-help">Nicht mehr im Team</p>}{personDetails(person, selected)}</article>)}</div>
      {!people.length && <p className="kita-help">Keine Mitarbeitenden oder gespeicherten Schichten für diesen Tag vorhanden.</p>}
    </section>
    </>}
  </div>
}
