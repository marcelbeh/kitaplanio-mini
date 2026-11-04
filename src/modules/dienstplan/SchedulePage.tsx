import { CopyWeekPanel } from './CopyWeekPanel'
import { MonthView } from './MonthView'
import { shiftPeriods } from './presentation'
import { appStorage } from '../../cloud/workspace'
import { useEffect, useState } from 'react'
import { loadSetup, savePlanningLimits } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'
import { ABSENCE_TYPES, PORTIONS, loadAbsences } from '../abwesenheiten/absences'
import { EVENT_TYPES, listOccurrences, loadEvents } from '../termine/events'
import { addDays, calendarWeek, dateLabel, dayEntries, loadShifts, localDate, schedulePeople, validDate, formatMinutes, workTime, visibleScheduleDays } from './schedule'
import { calculateStaffing } from './staffing'
import { StaffingCard } from './StaffingCard'
import { checkPlan, inspectStoredShifts } from './checks'
import type { CheckOptions } from './checks'
import { PlanChecks } from './PlanChecks'
import { GeneratorPanel } from './GeneratorPanel'
import { adoptProposal, generateProposal, readGeneratorContext } from './generator'
import type { Draft } from './generator'
import { PublicationPanel } from './PublicationPanel'
import { TeamPlan } from './TeamPlan'
import { teamPlan } from './publications'
import type { PublishedPlan } from './publications'
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
  const setup = read('Kita-Einstellungen', () => loadSetup(appStorage), null)
  return {
    setup, inspection: inspectStoredShifts({ getItem: key => appStorage.getItem(key) }),
    employees: read('Mitarbeiterdaten', () => loadEmployees(appStorage).employees, []),
    groups: setup?.groups ?? [],
    absences: read('Abwesenheiten', () => loadAbsences(appStorage).absences, []),
    events: read('Sondertermine', () => loadEvents(appStorage), []),
    shifts: read('Schichten', () => loadShifts(appStorage), []), errors,
  }
}
export function SchedulePage({ initialView = 'week', onViewChange }: { initialView?: 'week' | 'month'; onViewChange?: (view: 'week' | 'month') => void } = {}) {
  const [storedData, setData] = useState(readSchedule)
  const [view, setView] = useState<'week' | 'month'>(initialView)
  const [today, setToday] = useState(localDate)
  const [selected, setSelected] = useState(localDate)
  const [groupFilter, setGroupFilter] = useState('')
  const [dateError, setDateError] = useState('')
  const [editor, setEditor] = useState<{ value: Shift; mode: 'create' | 'update' } | null>(null)
  const [notice, setNotice] = useState('')
  const [checkOptions, setCheckOptions] = useState<CheckOptions>(() => storedData.setup?.planningRules ?? {})
  const [draft, setDraft] = useState<Draft | null>(null)
  const [selectedPublication, setSelectedPublication] = useState<PublishedPlan | null>(null)
  const [rulesMessage, setRulesMessage] = useState('')
  const [generatorError, setGeneratorError] = useState('')
  useEffect(() => { if (!editor && !draft) { setView(initialView); if (initialView === 'month') setSelectedPublication(null) } }, [initialView, editor, draft])
  const data = draft ? { ...draft.context, groups: draft.context.setup?.groups ?? [], errors: [] as string[], shifts: [...draft.context.shifts, ...draft.proposal.shifts], inspection: { entries: [...draft.context.shifts, ...draft.proposal.shifts] } } : storedData
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60_000)
    const reload = () => { setData(readSchedule()); setToday(localDate()) }
    window.addEventListener('storage', reload)
    window.addEventListener('focus', reload)
    return () => { window.clearInterval(timer); window.removeEventListener('storage', reload); window.removeEventListener('focus', reload) }
  }, [])
  useEffect(() => { if (!draft) setCheckOptions(storedData.setup?.planningRules ?? {}) }, [storedData, draft])
  const week = calendarWeek(selected)
  useEffect(() => { setSelectedPublication(null) }, [week.monday])
  const printable = teamPlan(data, selected)
  const issues = checkPlan({ from: week.monday, to: week.days[6], setup: data.setup, employees: data.employees, absences: data.absences, inspection: data.inspection, errors: data.errors, options: checkOptions, specialDemands: draft?.proposal.demands })
  const people = schedulePeople(data.employees, data.shifts, data.absences, week.monday, week.days[6])
  const filter = data.groups.some(group => group.id === groupFilter) ? groupFilter : ''
  const visiblePeople = people.filter(person => !filter || person.groupId === filter)
  const personGroups = [...new Set(visiblePeople.map(person => person.groupId))]
  const occurrences = listOccurrences(data.events, week.monday, week.days[6])
  const staffing = (date: string) => calculateStaffing(date, data.setup, data.shifts, data.absences, data.employees, data.errors.some(error => /^(Mitarbeiterdaten|Schichten|Abwesenheiten)/.test(error)), draft?.proposal.demands)
  const days = visibleScheduleDays(week.days, selected, data.shifts, data.absences, [...occurrences.map(item => item.date), ...(draft?.proposal.demands.map(demand => demand.date) ?? [])])
  const group = (id: string) => data.groups.find(group => group.id === id)?.name ?? (id ? 'Gruppe nicht mehr verfügbar' : 'Keine Gruppe zugeordnet')
  const tone = (id: string) => Math.max(0, data.groups.findIndex(group => group.id === id)) % 4
  function select(date: string) {
    if (draft && (date < draft.proposal.from || date > draft.proposal.to)) { setDateError('Bitte die Vorschau zuerst übernehmen oder verwerfen, bevor du die Woche wechselst.'); return }
    // Keep navigation and ISO arithmetic in the supported four-digit year range.
    if (!validDate(date) || date < '0002-01-01' || date > '9998-12-31') { setDateError('Bitte ein gültiges Datum zwischen 0002 und 9998 auswählen.'); return }
    setSelected(date); setDateError('')
  }
  function showDay(date: string) {
    select(date); setView('week'); onViewChange?.('week')
    window.requestAnimationFrame(() => {
      const target = document.getElementById(window.matchMedia('(max-width: 760px)').matches ? 'schedule-day-heading' : `schedule-date-${date}`)
      target?.focus(); target?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
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
      {entries.shifts.map(shift => {
        const proposed = draft?.proposal.shifts.some(item => item.id === shift.id) ?? false
        const fixed = !!draft && !proposed
        return <button type="button" className={`schedule-shift schedule-shift-action ${proposed ? 'schedule-proposed' : ''}`} key={shift.id} disabled={shiftsUnavailable || fixed} onClick={() => { setNotice(''); setEditor({ value: shift, mode: 'update' }) }}>
          <span className="schedule-sr-only">Schicht bearbeiten: {person.name}, {dateLabel(date)}. </span>
          {draft && <span className="status">{proposed ? 'Neu · Entwurf' : 'Bestehend · fixiert'}</span>}
          <strong>{shift.start}–{shift.end}</strong>
          <span className="schedule-periods">{shiftPeriods(shift, data.setup).map(period => <span className={`schedule-period schedule-period-${period.kind}`} key={period.kind}>{period.label}</span>)}</span>
          <span className="schedule-group" data-tone={tone(shift.groupId)}>{group(shift.groupId)}</span>
          <small>Brutto {formatMinutes(workTime([shift]).gross)} · Pause {shift.breakMinutes === undefined ? 'nicht erfasst' : formatMinutes(shift.breakMinutes)} · Netto {formatMinutes(workTime([shift]).net)}</small>
          <span className="schedule-edit-hint">{fixed ? 'Fixiert' : 'Bearbeiten ↗'}</span>
        </button>
      })}
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
    {data.setup?.name === 'DEMO · Kita Sonnengarten' && <p className="kita-lock-note" role="note"><strong>DEMO · ausschließlich fiktive Testdaten.</strong> Sollwerte sind Beispiele; ungeklärte Pausen und halbtägige Abwesenheiten bleiben Prüfhinweise. Keine reguläre Wochenendbetreuung.</p>}
    {data.errors.map(error => <p className="kita-errors" role="alert" key={error}>{error}</p>)}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {(editor || draft) && <p className="kita-help">Ansichtswechsel erst nach Abschließen oder Verwerfen der offenen Bearbeitung bzw. Vorschau.</p>}
    <div className="schedule-view-switch" role="group" aria-label="Dienstplanansicht"><button className="kita-button secondary" aria-pressed={view === 'week'} disabled={!!editor || !!draft} onClick={() => { setView('week'); onViewChange?.('week') }}>Woche</button><button className="kita-button secondary" aria-pressed={view === 'month'} disabled={!!editor || !!draft} onClick={() => { setSelectedPublication(null); setView('month'); onViewChange?.('month') }}>Monat</button></div>
    {editor ? <ShiftEditor key={editor.value.id} initial={editor.value} mode={editor.mode} data={data} onDraftSave={draft ? value => {
      if (value.date < draft.proposal.from || value.date > draft.proposal.to) throw Error('Entwurfsschichten müssen in der gewählten Woche liegen.')
      const person = draft.context.employees.find(person => person.id === value.employeeId)
      if (!person || !data.groups.some(group => group.id === value.groupId)) throw Error('Bitte vorhandene Person und Gruppe auswählen.')
      const normalized = { ...value, employeeName: person.name }
      setDraft({ ...draft, proposal: { ...draft.proposal, shifts: editor.mode === 'create' ? [...draft.proposal.shifts, normalized] : draft.proposal.shifts.map(shift => shift.id === value.id ? normalized : shift) } }); select(value.date); closeEditor()
    } : undefined} onDraftDelete={draft ? () => { setDraft({ ...draft, proposal: { ...draft.proposal, shifts: draft.proposal.shifts.filter(shift => shift.id !== editor.value.id) } }); closeEditor() } : undefined} onCancel={closeEditor} onDone={(date, message) => { setData(readSchedule()); select(date); setNotice(message); closeEditor() }} /> : view === 'month' ? <MonthView date={selected} data={{ ...data, options: checkOptions }} filter={filter} onFilter={setGroupFilter} onDate={select} onOpenDay={showDay} /> : <>
    <section className="kita-card schedule-controls" aria-label="Dienstplan-Zeitraum">
      <div className="schedule-week-title" role="status"><h2>KW {week.week} · {week.year}</h2><p>{dateLabel(week.monday)}–{dateLabel(days[days.length - 1])}</p></div>
      <div className="schedule-week-nav" aria-label="Wochennavigation"><button className="kita-button secondary" onClick={() => select(addDays(selected, -7))} aria-label="Vorherige Kalenderwoche">← Woche</button><button className="kita-button secondary" onClick={() => { const now = localDate(); setToday(now); select(now) }}>Heute</button><button className="kita-button secondary" onClick={() => select(addDays(selected, 7))} aria-label="Nächste Kalenderwoche">Woche →</button></div>
      <label>Datum / Kalenderwoche auswählen<input type="date" min="0002-01-01" max="9998-12-31" value={selected} onChange={event => select(event.target.value)} /></label>
      <p className="kita-help">Wähle ein Datum, um die zugehörige Kalenderwoche zu öffnen.</p>
      <label>Teamansicht nach Stammgruppe<select value={filter} onChange={event => setGroupFilter(event.target.value)}><option value="">Alle Gruppen · {people.length} Mitarbeitende</option>{data.groups.map(item => <option key={item.id} value={item.id}>{item.name} · {people.filter(person => person.groupId === item.id).length}</option>)}</select></label>
      <p className="kita-help">Der Filter ändert nur die Personenansicht. Personalbedarf, Planprüfung und Freigabe berücksichtigen weiterhin den gesamten Plan.</p>
      {dateError && <p className="kita-errors" role="alert">{dateError}</p>}
    </section>
    {!draft && !selectedPublication && <CopyWeekPanel key={week.monday} date={selected} unavailable={data.errors.length > 0} onDone={(date, count, skipped) => { setData(readSchedule()); setNotice(`${count} Schichten kopiert, ${skipped} übersprungen. Vorhandene Schichten und Freigaben bleiben unverändert.`); showDay(date) }} />}
    <PublicationPanel plan={printable} selected={selectedPublication} onSelect={setSelectedPublication} issues={issues} locked={!!draft} unavailable={data.errors.length > 0} />
    {!selectedPublication && <>
    <GeneratorPanel draft={draft} setup={data.setup} dates={week.days} issues={issues} error={generatorError} onGenerate={demands => {
      try { const context = readGeneratorContext(appStorage); setCheckOptions(context.setup?.planningRules ?? {}); setDraft({ context, proposal: generateProposal(context, selected, demands) }); setGeneratorError(''); setNotice('') }
      catch (error) { setGeneratorError((error as Error).message) }
    }} onDiscard={() => { setDraft(null); setData(readSchedule()); setGeneratorError(''); setNotice('Vorschau verworfen. Es wurden keine Schichten gespeichert.') }} onAdopt={() => {
      if (!draft) return
      try { const count = adoptProposal(appStorage, draft, checkOptions, true); setDraft(null); setData(readSchedule()); setGeneratorError(''); setNotice(`${count} neue Schichten übernommen.`) }
      catch (error) { setGeneratorError((error as Error).message) }
    }} />
    <PlanChecks issues={issues} options={checkOptions} onOptions={value => { setCheckOptions(value); setRulesMessage('Noch nicht gespeichert.') }} limitsLocked={!!draft} rulesMessage={rulesMessage} onSaveOptions={() => {
      try { savePlanningLimits(appStorage, checkOptions); setData(readSchedule()); setRulesMessage('Grenzen lokal gespeichert. Leere Grenzen bleiben deaktiviert.') }
      catch (error) { setRulesMessage((error as Error).message) }
    }} onSelect={showDay} />
    {!data.employees.length && !data.errors.length && <section className="kita-card"><h2>Dein Team fehlt noch</h2><p>Lege zuerst Mitarbeitende an. Bereits gespeicherte Einträge bleiben sichtbar.</p><a className="kita-button secondary" href="#mitarbeiter">Zum Team</a></section>}
    {!shiftsUnavailable && !data.shifts.some(shift => shift.date >= week.monday && shift.date <= week.days[6]) && <p className="kita-help">Für diese Woche sind keine Schichten eingetragen. Abwesenheiten und Sondertermine siehst du unabhängig davon.</p>}
    <div className="schedule-legend" aria-label="Legende"><span className="schedule-group" data-tone="0">Gruppe</span><span className="schedule-absence">Abwesenheit</span><span className="schedule-event">Sondertermin</span><span className="schedule-period schedule-period-early">Früh</span><span className="schedule-period schedule-period-core">Kern</span><span className="schedule-period schedule-period-late">Spät</span><span>Zeiten gemäß Kita-Konfiguration · Schicht antippen zum Bearbeiten</span></div>
    <div className="schedule-desktop">
      <p id="schedule-scroll-help" className="kita-help">{days.length > 5 ? 'Montag bis Sonntag · Wochenend-Sonderdienste' : 'Montag bis Freitag'} · Das Raster lässt sich bei Bedarf seitlich und nach unten scrollen. Namen und Tagesüberschriften bleiben sichtbar.</p>
      <div className="schedule-scroll" role="region" aria-label="Wochenraster Dienstplan" aria-describedby="schedule-scroll-help" tabIndex={0}>
        <table className="schedule-table" style={days.length > 5 ? { minWidth: 1240 } : undefined}><caption className="schedule-sr-only">Dienstplan KW {week.week}, {week.year}</caption><thead><tr><th scope="col">Mitarbeitende</th>{days.map(date => <th scope="col" key={date} id={`schedule-date-${date}`} tabIndex={-1} aria-current={date === today ? 'date' : undefined}>{dateLabel(date, true)}{date === today && <span className="schedule-today">Heute</span>}</th>)}</tr></thead><tbody>
          <tr><th scope="row">Personalbedarf</th>{days.map(date => <td key={date}><StaffingCard day={staffing(date)} /></td>)}</tr>
          <tr className="schedule-event-row"><th scope="row">Sondertermine</th>{days.map(date => <td key={date}>{eventsForDay(date)}</td>)}</tr>
          {visiblePeople.map(person => <tr key={person.id}><th scope="row">{person.name}{weeklySummary(person)}{person.historical && <small>Nicht mehr im Team</small>}</th>{days.map(date => <td key={date}>{personDetails(person, date)}</td>)}</tr>)}
        </tbody></table>
      </div>
    </div>
    <section className="schedule-mobile" aria-label="Tagesansicht">
      <div className="schedule-day-nav"><button className="kita-button secondary" aria-label="Vorheriger Tag" onClick={() => select(addDays(selected, -1))}>←</button><h2 id="schedule-day-heading" tabIndex={-1} aria-live="polite">{dateLabel(selected, true)}{selected === today && <span className="schedule-today">Heute</span>}</h2><button className="kita-button secondary" aria-label="Nächster Tag" onClick={() => select(addDays(selected, 1))}>→</button></div>
      <div className="schedule-day-tabs" role="group" aria-label="Wochentag auswählen">{days.map(date => <button type="button" key={date} aria-pressed={selected === date} onClick={() => select(date)}><strong>{new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short' }).format(new Date(`${date}T00:00:00Z`))}</strong><small>{date.slice(8)}.{date.slice(5, 7)}.</small></button>)}</div>
      <section className="kita-card"><h3>Personalbedarf</h3><StaffingCard day={staffing(selected)} /></section>
      <section className="kita-card"><h3>Sondertermine</h3>{eventsForDay(selected)}</section>
      {personGroups.map(groupId => <section className="schedule-person-group" key={groupId} aria-label={group(groupId)}><h3>{group(groupId)} · {visiblePeople.filter(person => person.groupId === groupId).length} Mitarbeitende</h3>
        <div className="schedule-day-cards">{visiblePeople.filter(person => person.groupId === groupId).map(person => <article className="kita-card" key={person.id}><h4 className="schedule-person-name">{person.name}</h4>{weeklySummary(person)}{person.historical && <p className="kita-help">Nicht mehr im Team</p>}{personDetails(person, selected)}</article>)}</div>
      </section>)}
      {!visiblePeople.length && <p className="kita-help">Keine Mitarbeitenden oder gespeicherten Schichten für diese Auswahl vorhanden.</p>}
    </section>
    </>}
    </>}
    {view === 'week' && <TeamPlan plan={selectedPublication ?? printable} published={selectedPublication} preview={!!selectedPublication} unavailable={!selectedPublication && data.errors.length > 0} proposal={!!draft} />}
  </div>
}
