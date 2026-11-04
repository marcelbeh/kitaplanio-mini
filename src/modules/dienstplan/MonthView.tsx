import { useState } from 'react'
import { calendarWeek, dateLabel, formatMinutes, localDate } from './schedule'
import { STAFFING_LABELS } from './staffing'
import { monthBounds, monthOverview, moveMonth } from './month'
import type { MonthData } from './month'
import './month.css'

type Props = { date: string; data: MonthData; filter: string; onFilter: (id: string) => void; onDate: (date: string) => void; onOpenDay: (date: string) => void }
export function MonthView({ date, data, filter, onFilter, onDate, onOpenDay }: Props) {
  const [error, setError] = useState('')
  const month = monthOverview(date, data, filter), groups = data.setup?.groups ?? []
  const title = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month.from}T00:00:00Z`))
  function navigate(value: string) {
    try { monthBounds(value); onDate(value); setError('') } catch { setError('Bitte einen gültigen Monat zwischen 0002 und 9998 auswählen.') }
  }
  function move(offset: number) { try { navigate(moveMonth(date, offset)) } catch (error) { setError((error as Error).message) } }
  function card(day: typeof month.days[number]) {
    return <button type="button" className={`month-day ${day.weekend ? 'month-weekend' : ''}`} value={day.date} key={day.date} aria-current={day.date === localDate() ? 'date' : undefined} onClick={() => onOpenDay(day.date)}>
      <span className="schedule-sr-only">Tag im Dienstplan öffnen: </span><strong>{dateLabel(day.date, true)}</strong>
      {day.weekend && <span className="month-special-label">Wochenend-Sondertermin/-dienst</span>}
      <span>{day.planned} geplant · {day.absent} abwesend/teilweise</span>
      <span className={`staffing-status staffing-${day.staffing.status}`}>{filter ? 'Gesamtplan: ' : ''}{STAFFING_LABELS[day.staffing.status]}</span>
      <small>Gesamtplan: {day.conflicts} Konflikte · {day.hints} Hinweise</small>
      {day.events.slice(0, 2).map(event => <span className="month-event" key={event.eventId}>{event.start} · {event.title}</span>)}
      {day.events.length > 2 && <small>+ {day.events.length - 2} weitere Sondertermine</small>}
      <span className="schedule-edit-hint">Tag im Dienstplan öffnen ↗</span>
    </button>
  }
  return <section className="month-view" aria-label="Monatsübersicht">
    <div className="kita-card month-controls">
      <h2 aria-live="polite">{title}</h2>
      <div className="schedule-week-nav" aria-label="Monatsnavigation"><button className="kita-button secondary" onClick={() => move(-1)} disabled={month.from === '0002-01-01'} aria-label="Vorheriger Monat">← Monat</button><button className="kita-button secondary" onClick={() => navigate(localDate())}>Heute</button><button className="kita-button secondary" onClick={() => move(1)} disabled={month.from === '9998-12-01'} aria-label="Nächster Monat">Monat →</button></div>
      <label>Monat auswählen<input type="month" min="0002-01" max="9998-12" value={date.slice(0, 7)} onChange={event => navigate(`${event.target.value}-01`)} /></label>
      <label>Stammgruppe anzeigen<select value={filter} onChange={event => onFilter(event.target.value)}><option value="">Gesamtes Team</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <p className="kita-help">Aktueller Arbeitsplan. Der Stammgruppenfilter begrenzt geplante/abwesende Personen, Sondertermine und Monatsstunden. Ampel und Prüfhinweise gelten weiterhin für den <strong>Gesamtplan</strong> inklusive gemeinsamer Früh-/Spätbetreuung. Details und Freigaben findest du über die Tagesauswahl im Wochenplan.</p>
      <p className="kita-help">Montag–Freitag; Wochenenden nur mit vorhandenen Sonderterminen oder Schichten in der Auswahl. Abwesende Personen können zugleich geplant sein – solche Konflikte bitte im Dienstplan prüfen.</p>
      {error && <p className="kita-errors" role="alert">{error}</p>}
    </div>
    {!month.days.some(day => day.planned > 0) && <p className="kita-help">Für diesen Monat sind keine Schichten in deiner Auswahl gespeichert. Abwesenheiten und Sondertermine bleiben sichtbar.</p>}
    <div className="month-weekday-headings" aria-hidden="true">{['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'].map(day => <strong key={day}>{day}</strong>)}</div>
    {month.weeks.map(monday => {
      const week = calendarWeek(monday), days = month.days.filter(day => calendarWeek(day.date).monday === monday)
      return <section className="month-week" key={monday} aria-label={`Kalenderwoche ${week.week}`}><h3>KW {week.week} · {week.year}</h3>
        {days.some(day => !day.weekend) && <div className="month-week-grid">{week.days.slice(0, 5).map(date => { const day = days.find(day => day.date === date); return day ? card(day) : <div className="month-placeholder" key={date} aria-hidden="true" /> })}</div>}
        {days.some(day => day.weekend) && <div className="month-special-days">{days.filter(day => day.weekend).map(card)}</div>}
      </section>
    })}
    <section className="kita-card month-hours" aria-label="Monatliche Nettoarbeitsstunden"><h2>Geplante Nettozeit · {title}</h2><p className="kita-help">Nur Schichten innerhalb dieses Monats, einschließlich vorhandener Wochenenddienste. Erfasste Pausen werden abgezogen; fehlende Pausenangaben erzeugen keinen automatischen Abzug. Keine Sollstunden- oder Überstundenberechnung.</p>
      <dl>{month.hours.map(person => <div key={person.id}><dt>{person.name}{person.historical && <small> · nicht mehr im Team</small>}</dt><dd>{formatMinutes(person.net)} <small>HH:MM</small></dd></div>)}</dl>
      {!month.hours.length && <p>Keine Mitarbeitenden oder gespeicherten Schichten für diese Auswahl vorhanden.</p>}
    </section>
  </section>
}
