import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { loadSetup, MAX_GROUPS, newSetup, resizeGroups, saveSetup, validateSetup } from './setup'
import type { KitaGroup, KitaSetup, StaffingPeriod, TimeRange } from './setup'
import './kita.css'

const steps = ['Gruppen', 'Öffnungszeiten', 'Mindestbesetzung', 'Prüfen & abschließen']
function readInitial() {
  try { return { setup: loadSetup(window.localStorage), error: '' } }
  catch { return { setup: null, error: 'Die lokalen Einstellungen konnten nicht geladen werden. Vorhandene Daten werden nicht überschrieben. Bitte Browser-Speicherzugriff bzw. gespeicherte Daten prüfen und die Seite neu laden.' } }
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
      start: group.periods.at(-1)?.end ?? core.start, end: core.end, minimum: 1,
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
    <section className="kita-card"><h2>Öffnungszeiten</h2><p>Montag bis Freitag · {setup.opening.start}–{setup.opening.end} Uhr</p></section>
    <section className="kita-card kita-shared"><span className="status">Gemeinsam · alle Gruppen</span><h2>Frühbetreuung</h2><p>{period(setup.early)}</p></section>
    <section className="kita-card"><h2>Kernbetreuung pro Gruppe</h2>{setup.groups.map(group => <div className="kita-summary-group" key={group.id}><h3>{group.name}</h3><ul>{[...group.periods].sort((a, b) => a.start.localeCompare(b.start)).map((p, i) => <li key={i}>{period(p)}</li>)}</ul></div>)}</section>
    <section className="kita-card kita-shared"><span className="status">Gemeinsam · alle Gruppen</span><h2>Spätbetreuung</h2><p>{period(setup.late)}</p></section>
  </div>
}

export function KitaPage() {
  const [initial] = useState(readInitial)
  const [saved, setSaved] = useState<KitaSetup | null>(initial.setup)
  const [draft, setDraft] = useState<KitaSetup>(() => initial.setup ?? newSetup())
  const [editing, setEditing] = useState(!initial.setup?.completed)
  const [step, setStep] = useState(0)
  const [count, setCount] = useState(String(draft.groups.length))
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  const locked = saved?.completed === true
  useEffect(() => { if (editing) stepHeading.current?.focus() }, [step, editing])
  useEffect(() => { if (errors.length) errorBox.current?.focus() }, [errors])

  function update(next: KitaSetup) { setDraft(next); setErrors([]); setNotice('') }
  function applyCount() {
    try {
      const next = resizeGroups(draft, Number(count))
      update(next)
      setCount(String(next.groups.length))
    } catch (error) { setErrors([(error as Error).message]) }
  }
  function persist(next: KitaSetup): boolean {
    try {
      const result = saveSetup(window.localStorage, next, saved)
      setSaved(result); setDraft(result); return true
    } catch (error) { setErrors([`Speichern fehlgeschlagen: ${(error as Error).message}`]); return false }
  }
  function nextStep(event: FormEvent) {
    event.preventDefault()
    const issues = validateSetup(draft, step < 3 ? step : undefined)
    if (step === 0 && Number(count) !== draft.groups.length) issues.unshift('Bitte die eingegebene Gruppenanzahl zuerst übernehmen.')
    if (issues.length) { setErrors(issues); return }
    if (step === 3) {
      if (persist({ ...draft, completed: true })) { setEditing(false); setNotice(locked ? 'Änderungen gespeichert.' : 'Deine Kita ist eingerichtet.'); setErrors([]) }
    } else {
      // During editing, the saved completed configuration remains intact until final confirmation.
      if (!locked && !persist(draft)) return
      setErrors([]); setStep(step + 1)
    }
  }
  function cancelEdit() {
    if (saved) { setDraft(saved); setCount(String(saved.groups.length)) }
    setEditing(false); setErrors([]); setNotice('')
  }

  return <div className="kita-setup">
    <div className="page-heading"><p className="eyebrow">KitaPlanio Lite</p><h1 id="page-title" tabIndex={-1}>Kita</h1><p>{editing ? 'Schritt für Schritt zu deinen Kita-Einstellungen.' : 'Deine Kita auf einen Blick.'}</p></div>
    <p className="kita-local-note">Lokal in diesem Browser gespeichert · keine Synchronisierung. {editing && !locked ? 'Dein Entwurf wird beim Weitergehen gespeichert.' : ''}</p>
    {initial.error ? <div className="kita-errors" role="alert">{initial.error}</div> : <>
      {notice && <p role="status" className="kita-success">{notice}</p>}
      {!editing ? <><p className="kita-lock-note">Einrichtung abgeschlossen · {saved?.groups.length} Gruppen. Die Gruppenanzahl ist dauerhaft gesperrt.</p><Summary setup={draft} /><button className="kita-button" onClick={() => { setStep(0); setEditing(true); setNotice('') }}>Einstellungen bearbeiten</button></> : <>
        <ol className="kita-progress" aria-label="Einrichtungsschritte">{steps.map((title, i) => <li key={title} aria-current={i === step ? 'step' : undefined}><span aria-hidden="true">{i + 1}</span>{title}</li>)}</ol>
        <form noValidate onSubmit={nextStep}>
          <h2 ref={stepHeading} tabIndex={-1}>Schritt {step + 1}: {steps[step]}</h2>
          {errors.length > 0 && <div className="kita-errors" role="alert" tabIndex={-1} ref={errorBox}><strong>Bitte prüfen:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
          {step === 0 && <section className="kita-card">
            {locked ? <p className="kita-lock-note">{draft.groups.length} Gruppen · Anzahl dauerhaft gesperrt. Du kannst die Namen weiterhin ändern.</p> : <><label className="kita-count">Anzahl der Gruppen<input type="number" inputMode="numeric" min="1" max={MAX_GROUPS} step="1" value={count} onChange={e => { setCount(e.target.value); setErrors([]) }} /></label><button type="button" className="kita-button secondary" onClick={applyCount}>Anzahl übernehmen</button><p className="kita-help">1–{MAX_GROUPS} Gruppen. Die Anzahl wird nach dem Abschluss dauerhaft gesperrt.</p></>}
            <div className="kita-names">{draft.groups.map((group, i) => <label key={group.id}>Name der Gruppe {i + 1}<input type="text" required value={group.name} onChange={e => update({ ...draft, groups: draft.groups.map(g => g.id === group.id ? { ...g, name: e.target.value } : g) })} /></label>)}</div>
          </section>}
          {step === 1 && <section className="kita-card"><h3>Montag bis Freitag</h3><p>Für alle fünf Wochentage gelten dieselben Öffnungszeiten.</p><TimeFields value={draft.opening} onChange={opening => update({ ...draft, opening })} /></section>}
          {step === 2 && <>
            <p className="kita-help">Öffnung {draft.opening.start}–{draft.opening.end} Uhr. Frühbetreuung beginnt mit der Öffnung, Spätbetreuung endet mit der Schließung. Dazwischen liegt die Kernbetreuung jeder Gruppe. Alle Zeitabschnitte müssen lückenlos anschließen. Jede Mindestbesetzung ist eine ganze Zahl ab 1.</p>
            <fieldset className="kita-card kita-shared"><legend>Gemeinsame Frühbetreuung</legend><p>Ein Mindestwert für alle Gruppen zusammen.</p><PeriodFields value={draft.early} onChange={early => update({ ...draft, early })} /></fieldset>
            <fieldset className="kita-card kita-shared"><legend>Gemeinsame Spätbetreuung</legend><p>Ein Mindestwert für alle Gruppen zusammen.</p><PeriodFields value={draft.late} onChange={late => update({ ...draft, late })} /></fieldset>
            <h3>Kernbetreuung pro Gruppe · {draft.early.end || '…'}–{draft.late.start || '…'} Uhr</h3>
            {draft.groups.map(group => (
              <GroupStaffing
                key={group.id}
                group={group}
                core={{ start: draft.early.end, end: draft.late.start }}
                onChange={next => update({ ...draft, groups: draft.groups.map(g => g.id === group.id ? next : g) })}
              />
            ))}
          </>}
          {step === 3 && <><p>{locked ? 'Prüfe deine Änderungen. Die Einrichtung bleibt abgeschlossen.' : 'Prüfe deine Angaben. Mit dem Abschluss wird die Gruppenanzahl dauerhaft gesperrt.'}</p><Summary setup={draft} /></>}
          <div className="kita-actions">
            {step > 0 && <button type="button" className="kita-button secondary" onClick={() => { setStep(step - 1); setErrors([]) }}>Zurück</button>}
            <button type="submit" className="kita-button">{step < 3 ? 'Weiter' : locked ? 'Änderungen speichern' : 'Einrichtung abschließen'}</button>
            {locked && <button type="button" className="kita-button secondary" onClick={cancelEdit}>Bearbeitung abbrechen</button>}
          </div>
        </form>
      </>}
    </>}
  </div>
}
