import { useEffect, useState } from 'react'
import type { KitaSetup } from '../kita/setup'
import type { PlanIssue } from './checks'
import type { SpecialDemand } from './staffing'
import type { Draft } from './generator'
import { proposalCoverage } from './generator'
import { dateLabel, formatMinutes, workTime } from './schedule'

export function GeneratorPanel({ draft, setup, dates, issues, error, onGenerate, onDiscard, onAdopt }: { draft: Draft | null; setup: KitaSetup | null; dates: string[]; issues: PlanIssue[]; error: string; onGenerate: (demands: SpecialDemand[]) => void; onDiscard: () => void; onAdopt: () => void }) {
  const [demands, setDemands] = useState<SpecialDemand[]>([])
  const [confirm, setConfirm] = useState(false)
  useEffect(() => { setConfirm(false) }, [draft?.proposal])
  const hard = issues.filter(issue => issue.kind === 'conflict').length
  const coverage = draft ? proposalCoverage(draft.context, draft.proposal) : []
  function change(index: number, patch: Partial<SpecialDemand>) { setDemands(demands.map((demand, i) => i === index ? { ...demand, ...patch } : demand)) }
  return <section className="kita-card generator-panel employee-page" aria-label="Dienstplanvorschlag">
    <h2>{draft ? 'Vorschau · noch nicht gespeichert' : 'Dienstplan vorschlagen'}</h2>
    {error && <p className="kita-errors" role="alert">{error}</p>}
    {!draft ? <>
      <p className="kita-help">Ergänzt nur offene Besetzung der ausgewählten Kalenderwoche. Vorhandene Schichten bleiben fest. Keine Standardpausen und keine zufällige Auswahl.</p>
      <details><summary>Optional: Wochenend-Sonderbedarf für diesen Vorschlag</summary><p className="kita-help">Nur explizite Vorgaben werden verwendet. Diese Bedarfe sind temporär und werden nicht mitgespeichert.</p>
        {demands.map((demand, index) => <fieldset className="employee-days" key={index}><legend>Sonderbedarf {index + 1}</legend><div className="employee-grid">
          <label>Datum<select value={demand.date} onChange={event => change(index, { date: event.target.value })}><option value="">Auswählen</option>{dates.slice(5).map(date => <option key={date} value={date}>{dateLabel(date, true)}</option>)}</select></label>
          <label>Gruppe<select value={demand.groupId} onChange={event => change(index, { groupId: event.target.value })}><option value="">Auswählen</option>{setup?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label>Beginn<input type="time" value={demand.start} onChange={event => change(index, { start: event.target.value })} /></label><label>Ende<input type="time" value={demand.end} onChange={event => change(index, { end: event.target.value })} /></label>
          <label>Soll-Personal<input type="number" min="1" step="1" inputMode="numeric" value={demand.minimum || ''} onChange={event => change(index, { minimum: Number(event.target.value) })} /></label>
        </div><button className="kita-button secondary" onClick={() => setDemands(demands.filter((_, i) => i !== index))}>Bedarf entfernen</button></fieldset>)}
        <button className="kita-button secondary" onClick={() => setDemands([...demands, { date: '', groupId: '', start: '', end: '', minimum: 0 }])}>Sonderbedarf hinzufügen</button>
      </details>
      <button className="kita-button" onClick={() => onGenerate(demands)}>Dienstplan vorschlagen</button>
    </> : <>
      <p role="status">{draft.proposal.shifts.length} neue Schichten · {coverage.length} offene/ungeklärte Zeitfenster · {hard} harte Konflikte · {issues.length - hard} Hinweise</p>
      <p className="kita-help">Neue Schichten sind im Plan markiert und bearbeitbar. Bestehende Schichten sind gesperrt. „+ Schicht“ ergänzt ausschließlich den Entwurf. Pausen bleiben ohne Eingabe leer.</p>
      <details><summary>Lücken, Grenzen und Wochenstunden</summary>
        <ul>{draft.proposal.reasons.map(reason => <li key={reason}>{reason}</li>)}{coverage.map(window => <li key={`${window.date}:${window.area}:${window.start}`}>{dateLabel(window.date)} · {formatMinutes(window.start)}–{formatMinutes(window.end)} · {window.name}: {window.status === 'check' ? 'Prüfen' : `Soll ${window.required ?? 'nicht konfiguriert'}, Ist ${window.actual}`}</li>)}</ul>
        <ul>{draft.context.employees.map(person => <li key={person.id}>{person.name}: {formatMinutes(workTime([...draft.context.shifts, ...draft.proposal.shifts].filter(shift => shift.employeeId === person.id && shift.date >= draft.proposal.from && shift.date <= draft.proposal.to)).net)} netto / Vertrag {formatMinutes(person.weeklyMinutes)}</li>)}</ul>
        {!!draft.proposal.demands.length && <p className="kita-help">Wochenend-Sollwerte gelten nur in dieser Vorschau. Nach Übernahme bleiben die Schichten erhalten; ohne dauerhaftes Sonderbedarfsmodell zeigt die normale Ampel wieder „Bedarf nicht festgelegt“.</p>}
      </details>
      <div className="kita-actions"><button className="kita-button" disabled={hard > 0 || !draft.proposal.shifts.length} onClick={() => setConfirm(true)}>Vorschlag übernehmen</button><button className="kita-button secondary" onClick={onDiscard}>Verwerfen</button></div>
      {hard > 0 && <p className="kita-help">Harte Konflikte verhindern die Übernahme. Bitte die Prüfmeldungen und offenen Zeitfenster bearbeiten.</p>}
      {confirm && <div className="generator-confirm" role="group" aria-label="Übernahme bestätigen"><p>{draft.proposal.shifts.length} neue Schichten gemeinsam lokal speichern? {issues.length - hard} Hinweise bleiben zur Entscheidung der Leitung. Bestehende Schichten bleiben unverändert.</p><div className="kita-actions"><button className="kita-button" onClick={onAdopt}>Übernahme bestätigen</button><button className="kita-button secondary" onClick={() => setConfirm(false)}>Zurück zur Vorschau</button></div></div>}
    </>}
  </section>
}
