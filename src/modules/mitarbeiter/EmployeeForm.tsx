import type { Employee, GroupReference, PlanningRule, Weekday } from './employees'
import { DAYS, hoursToMinutes } from './employees'
import type { TimeRange } from '../kita/setup'
import { useState } from 'react'

function TimeInputs({ value, onChange, startLabel = 'Beginn', endLabel = 'Ende' }: {
  value: TimeRange; onChange: (value: TimeRange) => void; startLabel?: string; endLabel?: string
}) {
  return <div className="kita-time-fields">
    <label>{startLabel}<input type="time" required value={value.start} onChange={e => onChange({ ...value, start: e.target.value })} /></label>
    <label>{endLabel}<input type="time" required value={value.end} onChange={e => onChange({ ...value, end: e.target.value })} /></label>
  </div>
}

export function EmployeeForm({ initial, groups, onSave, onCancel }: {
  initial: Employee; groups: GroupReference[]; onSave: (employee: Employee) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [hours, setHours] = useState(initial.weeklyMinutes ? String(initial.weeklyMinutes / 60).replace('.', ',') : '')
  function change(patch: Partial<Employee>) { setDraft({ ...draft, ...patch }) }
  function toggleWorkday(day: Weekday) {
    const selected = draft.workdays.includes(day)
    const fixedTimes = { ...draft.fixedTimes }
    if (selected) delete fixedTimes[day]
    change({ workdays: selected ? draft.workdays.filter(item => item !== day) : [...draft.workdays, day], fixedTimes })
  }
  function updateRule(index: number, patch: Partial<PlanningRule>) {
    change({ rules: draft.rules.map((rule, i) => index === i ? { ...rule, ...patch } : rule) })
  }
  return <form noValidate onSubmit={event => { event.preventDefault(); onSave({ ...draft, weeklyMinutes: hoursToMinutes(hours) }) }}>
    <section className="kita-card">
      <h3>Stammdaten</h3>
      <div className="employee-grid">
        <label>Name<input required type="text" value={draft.name} onChange={e => change({ name: e.target.value })} /></label>
        <label>Stammgruppe<select required value={draft.groupId} onChange={e => change({ groupId: e.target.value })}>
          <option value="">Bitte auswählen</option>
          {!groups.some(group => group.id === draft.groupId) && draft.groupId && <option value={draft.groupId}>Gruppe nicht mehr vorhanden</option>}
          {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        <label>Qualifikation<input required type="text" value={draft.qualification} onChange={e => change({ qualification: e.target.value })} /></label>
        <label>Vertragliche Wochenstunden<input required type="text" inputMode="decimal" value={hours} placeholder="z. B. 38,5" onChange={e => setHours(e.target.value)} /></label>
      </div>
      <fieldset className="employee-days"><legend>Reguläre Arbeitstage</legend>
        <p className="kita-help">Mindestens einen Tag auswählen. Beim Abwählen entfallen die festen Zeiten dieses Tages.</p>
        <div className="employee-day-options">{DAYS.map(day => <label className="employee-check" key={day.id}><input type="checkbox" checked={draft.workdays.includes(day.id)} onChange={() => toggleWorkday(day.id)} />{day.label}</label>)}</div>
      </fieldset>
    </section>
    <fieldset className="kita-card"><legend>Möglicher Arbeitsrahmen</legend>
      <TimeInputs value={draft.availability} startLabel="Frühester Arbeitsbeginn" endLabel="Spätestes Arbeitsende" onChange={availability => change({ availability })} />
    </fieldset>
    <fieldset className="kita-card"><legend>Feste Tageszeiten · verbindlich (Muss)</legend>
      <p className="kita-help">Optional für einzelne reguläre Arbeitstage. Die Zeiten müssen im Arbeitsrahmen liegen. Erforderliche Pausen innerhalb der Zeitfenster werden erst später berechnet und zählen nicht als Arbeitszeit.</p>
      {!draft.workdays.length && <p>Bitte zuerst reguläre Arbeitstage auswählen.</p>}
      {DAYS.filter(day => draft.workdays.includes(day.id)).map(day => <fieldset key={day.id} className="employee-fixed">
        <legend>{day.label}</legend>
        <label className="employee-check"><input type="checkbox" checked={!!draft.fixedTimes[day.id]} onChange={e => {
          const fixedTimes = { ...draft.fixedTimes }
          if (e.target.checked) fixedTimes[day.id] = { start: '', end: '' }
          else delete fixedTimes[day.id]
          change({ fixedTimes })
        }} />Feste Zeiten verwenden</label>
        {draft.fixedTimes[day.id] && <TimeInputs value={draft.fixedTimes[day.id]!} onChange={times => change({ fixedTimes: { ...draft.fixedTimes, [day.id]: times } })} />}
      </fieldset>)}
    </fieldset>
    <section className="kita-card"><h3>Zusätzliche Planungsregeln</h3>
      <p className="kita-help">Freie Beschreibungen werden nur gespeichert und angezeigt. Es erfolgt keine automatische Interpretation.</p>
      {draft.rules.map((rule, index) => <fieldset className="employee-rule" key={rule.id}>
        <legend>Regel {index + 1}</legend>
        <label>Beschreibung<textarea required rows={2} value={rule.description} onChange={e => updateRule(index, { description: e.target.value })} /></label>
        <div className="employee-grid">
          <label>Regeltyp<select value={rule.type} onChange={e => updateRule(index, { type: e.target.value as PlanningRule['type'] })}><option value="must">Verbindlich (Muss)</option><option value="wish">Wunsch</option></select></label>
          <label>Betroffener Wochentag<select value={rule.weekday ?? ''} onChange={e => updateRule(index, { weekday: (e.target.value || null) as Weekday | null })}><option value="">Kein bestimmter Tag</option>{DAYS.map(day => <option value={day.id} key={day.id}>{day.label}</option>)}</select></label>
        </div>
        <button type="button" className="kita-button secondary" onClick={() => change({ rules: draft.rules.filter(item => item.id !== rule.id) })}>Regel entfernen</button>
      </fieldset>)}
      <button type="button" className="kita-button secondary" onClick={() => change({ rules: [...draft.rules, { id: crypto.randomUUID(), description: '', type: 'must', weekday: null }] })}>Regel hinzufügen</button>
    </section>
    <div className="kita-actions"><button type="submit" className="kita-button">Speichern bestätigen</button><button type="button" className="kita-button secondary" onClick={onCancel}>Abbrechen</button></div>
  </form>
}
