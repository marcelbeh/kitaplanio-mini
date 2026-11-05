import { netTimeLabel } from './presentation'
import type { PublishedPlan, TeamPlan as TeamPlanData } from './publications'
import { calendarWeek, dateLabel, formatMinutes, overlappingShifts } from './schedule'
import './print.css'

export function TeamPlan({ plan, published, preview = false, unavailable = false, proposal = false }: { plan: TeamPlanData; published?: PublishedPlan | null; preview?: boolean; unavailable?: boolean; proposal?: boolean }) {
  const week = calendarWeek(plan.from)
  const days = plan.shifts.some(shift => shift.date >= week.days[5]) ? week.days : week.days.slice(0, 5)
  const reliable = (shifts: typeof plan.shifts) => !shifts.some(shift => overlappingShifts(shift, shifts).length)
  return <section className={`team-plan ${preview ? 'team-plan-preview' : ''}`} aria-label="Team-Druckansicht">
    <header><strong className="team-brand">caro. <span>Mit Herz geplant.</span></strong><h2>{plan.kitaName || 'Kita-Name nicht hinterlegt'} · Dienstplan KW {plan.week}/{plan.year}</h2><p>{dateLabel(plan.from)}–{dateLabel(plan.to)}</p><p className="team-version">{published ? `Veröffentlicht · Version ${published.version} · ${new Date(published.publishedAt).toLocaleString('de-DE')}` : proposal ? 'Entwurf · ungespeicherte Generatorvorschau · nicht veröffentlicht' : 'Entwurf · aktueller Arbeitsplan · nicht veröffentlicht'}</p></header>
    {unavailable ? <p>Kein vollständiger Plan verfügbar. Bitte vor dem Ausdruck die gespeicherten Daten prüfen.</p> : <>
      <table><thead><tr><th scope="col">Mitarbeitende</th>{days.map(date => <th scope="col" key={date}>{dateLabel(date, true)}</th>)}</tr></thead><tbody>
        {[...plan.employees].sort((a, b) => a.name.localeCompare(b.name, 'de')).flatMap(person => {
          const entries = plan.shifts.filter(shift => shift.employeeId === person.id)
          const daily = days.map(date => entries.filter(shift => shift.date === date))
          const rows = Math.max(1, ...daily.map(items => items.length))
          return Array.from({ length: rows }, (_, index) => <tr key={`${person.id}:${index}`}><th scope="row">{person.name}{index > 0 && <small>Fortsetzung</small>}{index === rows - 1 && <small>Woche netto: {reliable(entries) ? netTimeLabel(entries) : '—'}</small>}</th>{daily.map((items, dayIndex) => {
            const shift = items[index]
            return <td key={days[dayIndex]}>{shift ? <><strong>{shift.start}–{shift.end}</strong><span>{plan.groups.find(group => group.id === shift.groupId)?.name ?? 'Gruppe nicht hinterlegt'}</span><small>Pause: {shift.breakMinutes === undefined ? 'nicht erfasst' : formatMinutes(shift.breakMinutes)} · Netto: {netTimeLabel([shift])}</small></> : index === 0 ? <span>—</span> : null}{index === rows - 1 && items.length > 1 && <small className="team-day-total">Tag netto: {reliable(items) ? netTimeLabel(items) : '—'}</small>}</td>
          })}</tr>)
        })}
      </tbody></table>
      {!plan.shifts.length && <p>Keine Schichten für diese Kalenderwoche.</p>}
      <p className="team-footnote">Nettozeiten nach erfassten Pausen; keine automatischen Pausenabzüge. Nicht erfasste Pausen werden nicht geschätzt. Bei einer Schicht entspricht deren Nettozeit der Tagessumme. „—“ bei nicht eindeutig berechenbaren Summen.</p>
    </>}
  </section>
}
