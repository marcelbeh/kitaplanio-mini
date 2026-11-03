import { useEffect, useRef, useState } from 'react'
import { loadSetup } from '../kita/setup'
import { DAYS, deleteEmployee, formatHours, loadEmployees, newEmployee, saveEmployee, validateEmployee } from './employees'
import type { Employee } from './employees'
import { EmployeeForm } from './EmployeeForm'
import '../kita/kita.css'
import './employees.css'
import { ABSENCE_TYPES, formatAbsence, loadAbsences, sortAbsences } from '../abwesenheiten/absences'
import type { Absence } from '../abwesenheiten/absences'
import '../abwesenheiten/absences.css'

function readData() {
  // Read separately so a Kita error never hides stored employee records.
  let kita = null
  let store = { version: 1 as const, employees: [] as Employee[] }
  let kitaError = ''
  let employeeError = ''
  let absences: Absence[] = [], absenceError = ''
  try { kita = loadSetup(window.localStorage) } catch { kitaError = 'Kita-Einstellungen konnten nicht geladen werden. Vorhandene Daten bleiben erhalten.' }
  try { store = loadEmployees(window.localStorage) } catch { employeeError = 'Mitarbeiterdaten konnten nicht geladen werden (Speicherzugriff, beschädigte Daten oder unbekannte Version). Vorhandene Daten werden nicht überschrieben. Bitte prüfen und neu laden.' }
  try { absences = sortAbsences(loadAbsences(window.localStorage).absences) } catch { absenceError = 'Abwesenheiten konnten nicht geladen werden. Vorhandene Daten bleiben erhalten.' }
  return { kita, store, kitaError, employeeError, absences, absenceError }
}

export function EmployeesPage() {
  const [initial] = useState(readData)
  const [store, setStore] = useState(initial.store)
  const [editor, setEditor] = useState<{ employee: Employee; mode: 'create' | 'update' } | null>(null)
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const errorBox = useRef<HTMLDivElement>(null)
  const deleteBox = useRef<HTMLDivElement>(null)
  const groups = initial.kita?.completed ? initial.kita.groups : []
  const canEdit = groups.length > 0 && !initial.kitaError && !initial.employeeError
  useEffect(() => { if (editor) heading.current?.focus() }, [editor])
  useEffect(() => { if (errors.length) errorBox.current?.focus() }, [errors])
  useEffect(() => { if (deleting) deleteBox.current?.focus() }, [deleting])

  function openEditor(employee: Employee, mode: 'create' | 'update') {
    setEditor({ employee, mode }); setDeleting(null); setErrors([]); setNotice('')
  }
  function save(employee: Employee) {
    const issues = validateEmployee(employee, groups)
    if (issues.length) { setErrors(issues); return }
    try {
      // Re-read P2 for reference validation; never write to its storage key.
      const kita = loadSetup(window.localStorage)
      if (!kita?.completed) throw new Error('Bitte zuerst die Kita-Einrichtung abschließen.')
      setStore(saveEmployee(window.localStorage, employee, kita.groups, editor!.mode))
      setEditor(null); setErrors([]); setNotice('Mitarbeiterdaten gespeichert.')
    } catch (error) { setErrors([`Speichern fehlgeschlagen: ${(error as Error).message}`]) }
  }
  function confirmDelete() {
    if (!deleting) return
    try {
      setStore(deleteEmployee(window.localStorage, deleting.id))
      setDeleting(null); setErrors([]); setNotice('Mitarbeiter entfernt.')
    } catch (error) { setErrors([`Löschen fehlgeschlagen: ${(error as Error).message}`]) }
  }

  return <div className="kita-setup employee-page">
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Mitarbeiter</h1><p>Dein Team und seine individuellen Arbeitsregeln.</p></div>
    <p className="kita-local-note">Lokal in diesem Browser gespeichert · keine Synchronisierung.</p>
    <details className="employee-policy"><summary>Vorgaben für die spätere Planung</summary><p>Vertragliche Wochenstunden sind später exakt einzuhalten. Urlaub, Krankheit und Feiertage werden mit den geltenden vertraglichen Sollstunden berücksichtigt – ohne Nacharbeit. Gesetzliche Pausen werden automatisch eingeplant und zählen nicht als Arbeitszeit. P3 erfasst nur Daten; es berechnet weder Pausen, Tages-Sollstunden noch Dienstpläne.</p></details>
    {initial.kitaError && <p role="alert" className="kita-errors">{initial.kitaError}</p>}
    {!groups.length && !initial.kitaError && <p className="kita-card">Bitte zuerst die <a href="#kita">Kita-Einrichtung abschließen</a>. Die Stammgruppen werden von dort übernommen.</p>}
    {initial.employeeError && <p role="alert" className="kita-errors">{initial.employeeError}</p>}
    {errors.length > 0 && <div className="kita-errors" role="alert" ref={errorBox} tabIndex={-1}><strong>Bitte prüfen:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {editor ? <>
      <h2 tabIndex={-1} ref={heading}>{editor.mode === 'create' ? 'Mitarbeiter anlegen' : 'Mitarbeiter bearbeiten'}</h2>
      <EmployeeForm key={editor.employee.id} initial={editor.employee} groups={groups} onSave={save} onCancel={() => { setEditor(null); setErrors([]) }} />
    </> : <>
      {canEdit && <button className="kita-button" onClick={() => openEditor(newEmployee(crypto.randomUUID()), 'create')}>Mitarbeiter anlegen</button>}
      {!initial.employeeError && !store.employees.length && <section className="kita-card"><h2>Noch keine Mitarbeiter</h2><p>Noch niemand an Bord? Dann holen wir dein Team dazu. Die Kita-Einrichtung bildet dafür die Grundlage.</p></section>}
      <div className="employee-list">{store.employees.map(employee => <article className="kita-card" key={employee.id}>
        <h2>{employee.name}</h2>
        <p><strong>{groups.find(group => group.id === employee.groupId)?.name ?? 'Stammgruppe nicht verfügbar'}</strong> · {formatHours(employee.weeklyMinutes)} Wochenstunden</p>
        <p>{employee.qualification}</p>
        <dl className="employee-details">
          <dt>Reguläre Arbeitstage</dt><dd>{DAYS.filter(day => employee.workdays.includes(day.id)).map(day => day.label).join(', ')}</dd>
          <dt>Arbeitsrahmen</dt><dd>{employee.availability.start}–{employee.availability.end} Uhr</dd>
        </dl>
        {Object.keys(employee.fixedTimes).length > 0 && <div><h3>Feste Zeiten · Verbindlich (Muss)</h3><ul>{DAYS.filter(day => employee.fixedTimes[day.id]).map(day => <li key={day.id}>{day.label}: {employee.fixedTimes[day.id]!.start}–{employee.fixedTimes[day.id]!.end} Uhr</li>)}</ul></div>}
        {employee.rules.length > 0 && <div><h3>Zusätzliche Planungsregeln</h3><ul>{employee.rules.map(rule => <li key={rule.id}><strong>{rule.type === 'must' ? 'Verbindlich (Muss)' : 'Wunsch'}</strong>{rule.weekday ? ` · ${DAYS.find(day => day.id === rule.weekday)?.label}` : ''}: {rule.description}</li>)}</ul></div>}
        <details className="employee-absences"><summary>Abwesenheiten ({initial.absenceError ? 'nicht verfügbar' : initial.absences.filter(item => item.employeeId === employee.id).length})</summary>
          {initial.absenceError ? <p role="alert">{initial.absenceError}</p> : <ul>{initial.absences.filter(item => item.employeeId === employee.id).map(item => <li key={item.id}>{ABSENCE_TYPES[item.type]} · {formatAbsence(item)}</li>)}</ul>}
          <a href="#abwesenheiten">Abwesenheiten verwalten</a>
        </details>
        <div className="kita-actions">
          {canEdit && <button className="kita-button secondary" onClick={() => openEditor(employee, 'update')}>Bearbeiten<span className="employee-sr-only">: {employee.name}</span></button>}
          {!initial.employeeError && <button className="kita-button secondary" onClick={() => { setDeleting(employee); setErrors([]); setNotice('') }}>Entfernen<span className="employee-sr-only">: {employee.name}</span></button>}
        </div>
        {deleting?.id === employee.id && <div className="employee-delete" ref={deleteBox} tabIndex={-1} role="group" aria-label="Entfernen bestätigen">
          <p><strong>{employee.name} wirklich entfernen?</strong> Alle zugehörigen Arbeitsregeln werden ebenfalls gelöscht. Abwesenheiten bleiben als Historie erhalten.</p>
          <div className="kita-actions"><button className="kita-button" onClick={confirmDelete}>Endgültig entfernen</button><button className="kita-button secondary" onClick={() => { setDeleting(null); setErrors([]) }}>Abbrechen</button></div>
        </div>}
      </article>)}</div>
    </>}
  </div>
}
