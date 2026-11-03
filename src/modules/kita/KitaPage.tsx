import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { loadSetup, MAX_GROUPS, newSetup, resizeGroups } from './setup'
import { finishInterview, INTERVIEW_STEPS, loadInterview, saveInterview, startInterview, validateInterview } from './interview'
import type { InterviewDraft } from './interview'
import { DAYS, formatHours, newEmployee } from '../mitarbeiter/employees'
import { EmployeeForm } from '../mitarbeiter/EmployeeForm'
import '../mitarbeiter/employees.css'
import type { KitaGroup, KitaSetup, StaffingPeriod, TimeRange } from './setup'
import './kita.css'

function readInitial() {
  try {
    const setup = loadSetup(window.localStorage)
    const state = loadInterview(window.localStorage)
    return { setup, flow: state?.status === 'draft' ? state : !setup?.completed ? startInterview(window.localStorage) : null, error: '' }
  } catch { return { setup: null, flow: null, error: 'Die lokalen Einstellungen oder der Interview-Zwischenstand konnten nicht geladen werden. Vorhandene Daten wurden nicht überschrieben. Bitte gespeicherte Daten und Speicherzugriff prüfen.' } }
}

function TimeFields({ value, onChange }: { value: TimeRange; onChange: (value: TimeRange) => void }) {
  return <div className="kita-time-fields">
    <label>Beginn<input type="time" required value={value.start} onChange={e => onChange({ ...value, start: e.target.value })} /></label>
    <label>Ende<input type="time" required value={value.end} onChange={e => onChange({ ...value, end: e.target.value })} /></label>
  </div>
}
function PeriodFields({ value, onChange }: { value: StaffingPeriod; onChange: (value: StaffingPeriod) => void }) {
  return <div className="kita-period-fields">
    <TimeFields value={value} onChange={range => onChange({ ...value, ...range })} />
    <label>Mitarbeiter mindestens<input type="number" inputMode="numeric" min="1" step="1" required value={value.minimum || ''} onChange={e => onChange({ ...value, minimum: e.target.value === '' ? 0 : Number(e.target.value) })} /></label>
  </div>
}
function GroupStaffing({ group, core, onChange }: {
  group: KitaGroup
  core: TimeRange
  onChange: (group: KitaGroup) => void
}) {
  function changePeriod(index: number, value: StaffingPeriod) {
    onChange({ ...group, periods: group.periods.map((period, i) => i === index ? value : period) })
  }
  function addPeriod() {
    onChange({ ...group, periods: [...group.periods, {
      start: group.periods.at(-1)?.end ?? core.start, end: core.end, minimum: 0,
    }] })
  }
  return (
    <fieldset className="kita-card">
      <legend>{group.name}</legend>
      {group.periods.map((period, i) => (
        <fieldset className="kita-period" key={i}>
          <legend>Abschnitt {i + 1}</legend>
          <PeriodFields value={period} onChange={next => changePeriod(i, next)} />
          {group.periods.length > 1 && (
            <button type="button" className="kita-button secondary" onClick={() =>
              onChange({ ...group, periods: group.periods.filter((_, j) => i !== j) })
            }>Abschnitt {i + 1} entfernen</button>
          )}
        </fieldset>
      ))}
      <button type="button" className="kita-button secondary" onClick={addPeriod}>Zeitabschnitt hinzufügen</button>
    </fieldset>
  )
}

function Summary({ setup }: { setup: KitaSetup }) {
  const period = (p: StaffingPeriod) => `${p.start}–${p.end} Uhr · mindestens ${p.minimum} Mitarbeiter`
  return <div className="kita-summary">
    <section className="kita-card"><h2>{setup.name || 'Deine Kita'}</h2><p>{DAYS.filter(day => (setup.careDays ?? DAYS.map(item => item.id)).includes(day.id)).map(day => day.label).join(', ')} · {setup.opening.start}–{setup.opening.end} Uhr</p></section>
    <section className="kita-card kita-shared"><span className="status">Gemeinsam · alle Gruppen</span><h2>Frühbetreuung</h2><p>{period(setup.early)}</p></section>
    <section className="kita-card"><h2>Kernbetreuung pro Gruppe</h2>{setup.groups.map(group => <div className="kita-summary-group" key={group.id}><h3>{group.name}</h3><ul>{[...group.periods].sort((a, b) => a.start.localeCompare(b.start)).map((p, i) => <li key={i}>{period(p)}</li>)}</ul></div>)}</section>
    <section className="kita-card kita-shared"><span className="status">Gemeinsam · alle Gruppen</span><h2>Spätbetreuung</h2><p>{period(setup.late)}</p></section>
  </div>
}

export function KitaPage() {
  const [initial] = useState(readInitial)
  const [saved, setSaved] = useState(initial.setup)
  const [flow, setFlow] = useState<InterviewDraft | null>(initial.flow)
  const [editing, setEditing] = useState(!!initial.flow && !initial.flow.paused)
  const [errors, setErrors] = useState<string[]>([])
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  const draft = flow?.setup ?? saved ?? newSetup()
  const step = flow?.step ?? 0
  const locked = saved?.completed === true
  const area = flow?.staffingArea ?? 'early'
  const member = flow?.team.find(item => item.employee.id === flow.activeMember) ?? flow?.team[0]
  useEffect(() => { if (editing) stepHeading.current?.focus() }, [step, editing])
  useEffect(() => { if (errors.length) errorBox.current?.focus() }, [errors])
  useEffect(() => {
    if (!flow) return
    try { saveInterview(window.localStorage, flow); setSaveError('') }
    catch (error) { setSaveError(`Zwischenspeichern fehlgeschlagen: ${(error as Error).message}`) }
  }, [flow])

  function change(patch: Partial<InterviewDraft>) { if (flow) { setFlow({ ...flow, ...patch }); setErrors([]); setNotice('') } }
  function update(setup: KitaSetup) { change({ setup }) }
  function move(next: number) { change({ step: next }) }
  function begin() {
    try {
      const next = flow ?? startInterview(window.localStorage)
      saveInterview(window.localStorage, { ...next, paused: false }, true)
      setFlow({ ...next, paused: false }); setEditing(true); setErrors([])
    } catch (error) { setErrors([(error as Error).message]) }
  }
  function applyCount() {
    if (!flow) return
    try {
      const next = resizeGroups(draft, Number(flow.groupCount))
      next.groups = next.groups.map((group, i) => i < draft.groups.length ? group : { ...group, periods: group.periods.map(period => ({ ...period, minimum: 0 })) })
      update(next)
    } catch (error) { setErrors([(error as Error).message]) }
  }
  function nextStep(event: FormEvent) {
    event.preventDefault()
    if (!flow) return
    const issues = validateInterview(flow, step < 5 ? step : undefined)
    if (issues.length) { setErrors(issues); return }
    try {
      saveInterview(window.localStorage, flow)
      if (step < 5) { move(step + 1); return }
      finishInterview(window.localStorage, flow)
      setFlow(null); setSaved(loadSetup(window.localStorage)); setEditing(false); setNotice('Deine Einrichtung ist abgeschlossen.'); setSaveError('')
      window.location.hash = '#dashboard'
    } catch (error) { setErrors([(error as Error).message]) }
  }
  function pause() {
    if (!flow) return
    try {
      const next = { ...flow, paused: true }
      saveInterview(window.localStorage, next); setFlow(next); setEditing(false); window.location.hash = '#dashboard'
    } catch (error) { setErrors([(error as Error).message]) }
  }
  function reloadData() {
    if (!window.confirm('Interviewantworten durch die aktuell gespeicherten Stammdaten ersetzen?')) return
    try { setFlow(startInterview(window.localStorage)); setSaved(loadSetup(window.localStorage)); setErrors([]) }
    catch (error) { setErrors([(error as Error).message]) }
  }
  function addMember() {
    if (!flow) return
    const employee = newEmployee(crypto.randomUUID())
    change({ team: [...flow.team, { employee, hours: '' }], activeMember: employee.id })
  }
  const teamPicker = flow && <div className="interview-members">
    <p className="kita-help">Eine Person nach der anderen. Vorhandene Personen und ihre Angaben sind vorausgefüllt.</p>
    <div className="kita-actions">{flow.team.map((item, i) => <button type="button" key={item.employee.id} className={`kita-button ${member?.employee.id === item.employee.id ? '' : 'secondary'}`} onClick={() => change({ activeMember: item.employee.id })}>{item.employee.name || `Person ${i + 1}`}</button>)}{step === 3 && <button type="button" className="kita-button secondary" onClick={addMember}>Person hinzufügen</button>}</div>
  </div>

  return <div className="kita-setup employee-page">
    <div className="page-heading"><p className="eyebrow">KitaPlanio Lite</p><h1 id="page-title" tabIndex={-1}>Kita</h1><p>{editing ? 'Deine Einrichtung im Gespräch – Schritt für Schritt.' : 'Deine Kita auf einen Blick.'}</p></div>
    <p className="kita-local-note">{flow ? 'Antworten werden automatisch lokal zwischengespeichert. Stammdaten werden erst beim bestätigten Abschluss geändert.' : 'Lokal in diesem Browser gespeichert · keine Synchronisierung.'}</p>
    {initial.error && <div className="kita-errors" role="alert">{initial.error}</div>}
    {saveError && <div className="kita-errors" role="alert">{saveError}</div>}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {errors.length > 0 && <div className="kita-errors" role="alert" tabIndex={-1} ref={errorBox}><strong>Bitte prüfen:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button type="button" className="kita-button secondary" onClick={reloadData}>Aktuelle Stammdaten neu einlesen</button></div>}
    {!initial.error && (!editing ? <>
      {saved?.completed && <><p className="kita-lock-note">Einrichtung abgeschlossen · {saved.groups.length} Gruppen. Die Gruppenanzahl ist dauerhaft gesperrt.</p><Summary setup={saved} />{saved.pauseNotes && <section className="kita-card"><h2>Pausenhinweise</h2><p>{saved.pauseNotes}</p></section>}<p><a className="kita-button secondary" href="#mitarbeiter">Team und Arbeitsregeln bearbeiten</a></p></>}
      {!saved?.completed && <section className="kita-card"><h2>Dein Zwischenstand wartet auf dich.</h2><p>Du kannst jederzeit dort weitermachen, wo du aufgehört hast.</p></section>}
      <button className="kita-button" onClick={begin}>{flow ? 'Interview fortsetzen' : 'Einstellungen bearbeiten'}</button>
    </> : flow && <>
      <ol className="kita-progress interview-progress" aria-label="Einrichtungsschritte">{INTERVIEW_STEPS.map((title, i) => <li key={title} aria-current={i === step ? 'step' : undefined}><span aria-hidden="true">{i + 1}</span>{title}</li>)}</ol>
      <form noValidate onSubmit={nextStep}>
        <h2 ref={stepHeading} tabIndex={-1}>Schritt {step + 1} von 6: {INTERVIEW_STEPS[step]}</h2>
        {step === 0 && <section className="kita-card">
          <h3>Wie heißt deine Kita und welche Gruppen gehören dazu?</h3>
          <label>Name der Kita (optional)<input value={draft.name ?? ''} onChange={event => update({ ...draft, name: event.target.value })} /></label>
          {locked ? <p className="kita-lock-note">{draft.groups.length} Gruppen · Anzahl dauerhaft gesperrt. Die Namen bleiben bearbeitbar.</p> : <><label className="kita-count">Anzahl der Gruppen<input type="number" inputMode="numeric" min="1" max={MAX_GROUPS} step="1" value={flow.groupCount} onChange={event => change({ groupCount: event.target.value })} /></label><button type="button" className="kita-button secondary" onClick={applyCount}>Anzahl übernehmen</button></>}
          <div className="kita-names">{draft.groups.map((group, i) => <label key={group.id}>Name der Gruppe {i + 1}<input value={group.name} onChange={event => update({ ...draft, groups: draft.groups.map(g => g.id === group.id ? { ...g, name: event.target.value } : g) })} /></label>)}</div>
        </section>}
        {step === 1 && <section className="kita-card"><h3>An welchen Tagen und zu welchen Zeiten betreut ihr?</h3><div className="employee-day-options">{DAYS.map(day => <label className="employee-check" key={day.id}><input type="checkbox" checked={(draft.careDays ?? DAYS.map(item => item.id)).includes(day.id)} onChange={event => { const days = draft.careDays ?? DAYS.map(item => item.id); update({ ...draft, careDays: event.target.checked ? [...days, day.id] : days.filter(id => id !== day.id) }) }} />{day.label}</label>)}</div><p className="kita-help">Einheitliche Zeiten an den ausgewählten Betreuungstagen (Montag bis Freitag).</p><TimeFields value={draft.opening} onChange={opening => update({ ...draft, opening })} /></section>}
        {step === 2 && <>
          <p className="kita-help">Welche Mindestbesetzung braucht ihr wirklich? Bitte selbst festlegen. Früh- und Spätbetreuung gelten gemeinsam, dazwischen gelten die Zeitabschnitte jeder Gruppe. Alle Bereiche schließen lückenlos aneinander an.</p>
          <div className="kita-actions"><button type="button" className={`kita-button ${area === 'early' ? '' : 'secondary'}`} onClick={() => change({ staffingArea: 'early' })}>Frühbetreuung</button><button type="button" className={`kita-button ${area === 'late' ? '' : 'secondary'}`} onClick={() => change({ staffingArea: 'late' })}>Spätbetreuung</button>{draft.groups.map(group => <button key={group.id} type="button" className={`kita-button ${area === group.id ? '' : 'secondary'}`} onClick={() => change({ staffingArea: group.id })}>{group.name}</button>)}</div>
          {area === 'early' && <fieldset className="kita-card kita-shared"><legend>Gemeinsame Frühbetreuung</legend><PeriodFields value={draft.early} onChange={early => update({ ...draft, early })} /></fieldset>}
          {area === 'late' && <fieldset className="kita-card kita-shared"><legend>Gemeinsame Spätbetreuung</legend><PeriodFields value={draft.late} onChange={late => update({ ...draft, late })} /></fieldset>}
          <h3>Kernbetreuung · {draft.early.end || '…'}–{draft.late.start || '…'} Uhr</h3>
          {draft.groups.filter(group => group.id === area).map(group => <GroupStaffing key={group.id} group={group} core={{ start: draft.early.end, end: draft.late.start }} onChange={next => update({ ...draft, groups: draft.groups.map(g => g.id === group.id ? next : g) })} />)}
        </>}
        {(step === 3 || step === 4) && <>
          <h3>{step === 3 ? 'Wer gehört zu deinem Team?' : 'Wann kann dein Team arbeiten und was ist euch wichtig?'}</h3>
          {teamPicker}
          {member && <EmployeeForm key={`${step}-${member.employee.id}`} initial={member.employee} hoursInput={member.hours} groups={draft.groups} part={step === 3 ? 'team' : 'rules'} embedded onDraftChange={(employee, hours) => setFlow(current => current ? { ...current, team: current.team.map(item => item.employee.id === employee.id ? { employee, hours } : item) } : current)} />}
          {step === 3 && member && !JSON.parse(flow.baseTeam ?? '{"employees":[]}').employees.some((employee: { id: string }) => employee.id === member.employee.id) && <button type="button" className="kita-button secondary" onClick={() => { if (window.confirm('Diese neu angelegte Person aus dem Interview verwerfen?')) change({ team: flow.team.filter(item => item.employee.id !== member.employee.id), activeMember: null }) }}>Neue Person verwerfen</button>}
          {step === 4 && <section className="kita-card"><h3>Gibt es ergänzende Hinweise zu Pausen?</h3><label>Betriebliche Pausenhinweise (optional)<textarea rows={3} value={draft.pauseNotes ?? ''} onChange={event => update({ ...draft, pauseNotes: event.target.value })} /></label><p className="kita-help">Gesetzliche Pausen zählen später nicht als Arbeitszeit. Hier werden nur deine Hinweise gesammelt, keine rechtlichen Vorgaben festgelegt oder automatisch ausgewertet. Wünsche und feste Dienste erfasst du oben pro Person.</p></section>}
        </>}
        {step === 5 && <>
          <p>Passt alles? Änderungen werden erst mit deinem Abschluss übernommen.</p><Summary setup={draft} />
          <section className="kita-card"><h2>Dein Team und seine Arbeitsregeln</h2>{flow.team.map(item => <div className="kita-summary-group" key={item.employee.id}><h3>{item.employee.name}</h3><p>{draft.groups.find(group => group.id === item.employee.groupId)?.name} · {formatHours(item.employee.weeklyMinutes)} Wochenstunden · {item.employee.qualification}</p><p>{DAYS.filter(day => item.employee.workdays.includes(day.id)).map(day => day.label).join(', ')} · {item.employee.availability.start}–{item.employee.availability.end} Uhr</p>{DAYS.filter(day => item.employee.fixedTimes[day.id]).map(day => <p key={day.id}>Fester Dienst (verbindlich): {day.label} {item.employee.fixedTimes[day.id]!.start}–{item.employee.fixedTimes[day.id]!.end} Uhr</p>)}{item.employee.rules.map(rule => <p key={rule.id}>{rule.type === 'must' ? 'Verbindlich' : 'Wunsch'}{rule.weekday ? ` · ${DAYS.find(day => day.id === rule.weekday)?.label}` : ''}: {rule.description}</p>)}</div>)}{draft.pauseNotes && <p>Pausenhinweise: {draft.pauseNotes}</p>}</section>
          <div className="kita-actions">{INTERVIEW_STEPS.slice(0, 5).map((label, i) => <button className="kita-button secondary" type="button" key={label} onClick={() => move(i)}>{label} korrigieren</button>)}</div>
        </>}
        <div className="kita-actions">
          {step > 0 && <button type="button" className="kita-button secondary" onClick={() => move(step - 1)}>Zurück</button>}
          <button type="submit" className="kita-button">{step < 5 ? 'Weiter' : 'Einrichtung bestätigen und abschließen'}</button>
          <button type="button" className="kita-button secondary" onClick={pause}>Später fortsetzen</button>
        </div>
      </form>
    </>)}
  </div>
}
