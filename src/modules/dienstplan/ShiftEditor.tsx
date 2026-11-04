import { appStorage } from '../../cloud/workspace'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Employee } from '../mitarbeiter/employees'
import type { KitaGroup } from '../kita/setup'
import type { Absence } from '../abwesenheiten/absences'
import type { Event } from '../termine/events'
import { deleteShift, formatMinutes, overlappingShifts, saveShift, shiftWarnings, validateShift, workTime } from './schedule'
import type { Shift } from './schedule'
import '../mitarbeiter/employees.css'

export function ShiftEditor({ initial, mode, data, onDone, onCancel, onDraftSave, onDraftDelete }: {
  initial: Shift; mode: 'create' | 'update'
  data: { employees: Employee[]; groups: KitaGroup[]; shifts: Shift[]; absences: Absence[]; events: Event[]; errors: string[] }
  onDraftSave?: (value: Shift) => void; onDraftDelete?: () => void
  onDone: (date: string, message: string) => void; onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const [pause, setPause] = useState(initial.breakMinutes?.toString() ?? '')
  const [error, setError] = useState(''), [deleting, setDeleting] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null), errorBox = useRef<HTMLParagraphElement>(null), deleteBox = useRef<HTMLDivElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => { if (error) errorBox.current?.focus() }, [error])
  useEffect(() => { if (deleting) deleteBox.current?.focus() }, [deleting])
  const draft = { ...value, breakMinutes: pause === '' ? undefined : Number(pause) }
  const valid = !validateShift(draft).length
  const times = valid ? workTime([draft]) : null
  const warnings = shiftWarnings(draft, data.absences, data.events, data.employees)
  const overlaps = valid ? overlappingShifts(draft, data.shifts) : []
  function change(patch: Partial<Shift>) { setValue({ ...value, ...patch }); setError(''); setDeleting(false) }
  function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (onDraftSave) {
        const errors = validateShift(draft)
        if (errors.length) throw Error(errors.join(' '))
        if (overlappingShifts(draft, data.shifts).length) throw Error('Zeitüberschneidung: Bitte die Vorschauzeiten prüfen.')
        onDraftSave(draft); return
      }
      saveShift(appStorage, draft, mode, mode === 'update' ? initial : undefined); onDone(draft.date, 'Schicht gespeichert.') }
    catch (error) { setError((error as Error).message) }
  }
  function remove() {
    try { if (onDraftDelete) { onDraftDelete(); return }
      deleteShift(appStorage, initial); onDone(initial.date, 'Schicht gelöscht.') }
    catch (error) { setError((error as Error).message) }
  }
  return <section className="kita-card schedule-editor employee-page" aria-label="Schicht bearbeiten">
    <h2 ref={heading} tabIndex={-1}>{mode === 'create' ? 'Schicht anlegen' : 'Schicht bearbeiten'}</h2>
    {data.errors.map(message => <p className="kita-errors" role="alert" key={message}>{message}</p>)}
    {error && <p className="kita-errors" ref={errorBox} tabIndex={-1} role="alert">{error}</p>}
    <form noValidate onSubmit={submit}>
      <div className="employee-grid">
        <label>Mitarbeiter<select required value={value.employeeId} onChange={event => change({ employeeId: event.target.value })}><option value="">Bitte auswählen</option>{!data.employees.some(person => person.id === value.employeeId) && value.employeeId && <option value={value.employeeId}>{value.employeeName || value.employeeId} (nicht mehr im Team)</option>}{data.employees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label>Datum<input required type="date" min="0002-01-01" max="9998-12-31" value={value.date} onChange={event => change({ date: event.target.value })} /></label>
        <label>Gruppe<select required value={value.groupId} onChange={event => change({ groupId: event.target.value })}><option value="">Bitte auswählen</option>{!data.groups.some(group => group.id === value.groupId) && value.groupId && <option value={value.groupId}>{value.groupId} (nicht mehr vorhanden)</option>}{data.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label>Beginn<input required type="time" value={value.start} onChange={event => change({ start: event.target.value })} /></label>
        <label>Ende<input required type="time" value={value.end} onChange={event => change({ end: event.target.value })} /></label>
        <label>Pause in Minuten (optional)<input type="number" min="0" step="1" inputMode="numeric" value={pause} onChange={event => { setPause(event.target.value); setError(''); setDeleting(false) }} /></label>
      </div>
      <p className="kita-help schedule-form-help">Beginn und Ende gelten für dasselbe Datum. Ohne Pausenangabe wird nichts abgezogen. Es werden keine Standardpausen ergänzt.</p>
      {times && <p className="schedule-time-summary" role="status">Brutto {formatMinutes(times.gross)} · Pause {pause === '' ? 'nicht erfasst' : formatMinutes(times.pause)} · Netto <strong>{formatMinutes(times.net)}</strong></p>}
      {!!overlaps.length && <p className="kita-errors" role="status">Zeitüberschneidung mit {overlaps.map(shift => `${shift.start}–${shift.end}`).join(', ')}. Bitte die Zeiten korrigieren.</p>}
      {!!warnings.length && <div className="schedule-conflict" role="status"><strong>Bitte prüfen – Speichern bleibt möglich:</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      <div className="kita-actions"><button type="submit" className="kita-button">Schicht speichern</button><button type="button" className="kita-button secondary" onClick={onCancel}>Abbrechen</button>{mode === 'update' && <button type="button" className="kita-button secondary" onClick={() => setDeleting(true)}>Schicht löschen</button>}</div>
      {deleting && <div className="employee-delete" role="group" aria-label="Schicht löschen bestätigen" ref={deleteBox} tabIndex={-1}><p>Diese Schicht am {initial.date.split('-').reverse().join('.')} von {initial.start} bis {initial.end} wirklich löschen?</p><div className="kita-actions"><button type="button" className="kita-button" onClick={remove}>Endgültig löschen</button><button type="button" className="kita-button secondary" onClick={() => setDeleting(false)}>Nicht löschen</button></div></div>}
    </form>
  </section>
}
