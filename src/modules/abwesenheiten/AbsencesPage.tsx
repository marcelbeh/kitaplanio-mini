import { appStorage } from '../../cloud/workspace'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { loadEmployees } from '../mitarbeiter/employees'
import type { Employee } from '../mitarbeiter/employees'
import { ABSENCE_TYPES, PORTIONS, deleteAbsence, filterAbsences, findOverlaps, formatAbsence, loadAbsences, newAbsence, saveAbsence, validateAbsence } from './absences'
import type { Absence, AbsenceStore } from './absences'
import '../kita/kita.css'
import '../mitarbeiter/employees.css'
import './absences.css'

function readInitial() {
  let employees: Employee[] = [], store: AbsenceStore = { version: 1, absences: [] }
  let teamError = '', absenceError = ''
  try { employees = loadEmployees(appStorage).employees } catch { teamError = 'Mitarbeiterdaten konnten nicht geladen werden. Neue Abwesenheiten können erst nach Beheben des Speicherproblems erfasst werden.' }
  try { store = loadAbsences(appStorage) } catch { absenceError = 'Abwesenheiten konnten nicht geladen werden (Speicherzugriff, beschädigte Daten oder unbekannte Version). Vorhandene Daten bleiben erhalten. Bitte prüfen und neu laden.' }
  return { employees, store, teamError, absenceError }
}
const emptyFilters = { employeeId: '', from: '', to: '' }
export function AbsencesPage() {
  const [initial] = useState(readInitial)
  const [store, setStore] = useState(initial.store)
  const [editor, setEditor] = useState<{ value: Absence; mode: 'create' | 'update' } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filters, setFilters] = useState(emptyFilters)
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null), errorBox = useRef<HTMLDivElement>(null), deleteBox = useRef<HTMLDivElement>(null)
  useEffect(() => { if (editor) heading.current?.focus() }, [editor?.value.id])
  useEffect(() => { if (errors.length) errorBox.current?.focus() }, [errors])
  useEffect(() => { if (deleting) deleteBox.current?.focus() }, [deleting])
  const employeeName = (item: Absence) => initial.employees.find(employee => employee.id === item.employeeId)?.name ?? `${item.employeeName} (${initial.teamError ? 'Teamdaten nicht verfügbar' : 'nicht mehr im Team'})`
  const filterPeople = new Map(initial.employees.map(employee => [employee.id, employee.name]))
  store.absences.forEach(item => { if (!filterPeople.has(item.employeeId)) filterPeople.set(item.employeeId, `${item.employeeName} (${initial.teamError ? 'Teamdaten nicht verfügbar' : 'nicht mehr im Team'})`) })
  const invalidFilter = !!(filters.from && filters.to && filters.from > filters.to)
  const visible = invalidFilter ? [] : filterAbsences(store.absences, filters)
  const conflicts = editor ? findOverlaps(editor.value, store.absences) : []
  function open(value: Absence, mode: 'create' | 'update') { setEditor({ value, mode }); setDeleting(null); setErrors([]); setNotice('') }
  function change(patch: Partial<Absence>) { if (editor) { setEditor({ ...editor, value: { ...editor.value, ...patch } }); setErrors([]) } }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!editor) return
    const issues = validateAbsence(editor.value)
    if (issues.length) { setErrors(issues); return }
    try { setStore(saveAbsence(appStorage, editor.value, editor.mode, editor.mode === 'update' ? store.absences.find(item => item.id === editor.value.id) : undefined)); setEditor(null); setErrors([]); setNotice('Abwesenheit gespeichert.'); setFilters(emptyFilters) }
    catch (error) { setErrors([(error as Error).message]) }
  }
  function confirmDelete() {
    if (!deleting) return
    try { setStore(deleteAbsence(appStorage, deleting, store.absences.find(item => item.id === deleting))); setDeleting(null); setErrors([]); setNotice('Abwesenheit gelöscht.') }
    catch (error) { setErrors([(error as Error).message]) }
  }
  return <div className="kita-setup employee-page absence-page">
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Abwesenheiten</h1><p>Urlaub, Krankheit und weitere Abwesenheiten – übersichtlich an einem Ort.</p></div>
    <p className="kita-local-note">Im aktuellen Arbeitsbereich gespeichert. Cloud-Synchronisierung erfolgt nur im eingerichteten Cloud-Arbeitsbereich und auf Knopfdruck. Abwesenheiten werden in der Dienstplanung berücksichtigt; es werden keine Sollstunden oder Urlaubskonten erfunden.</p>
    {initial.teamError && <p className="kita-errors" role="alert">{initial.teamError}</p>}
    {initial.absenceError && <p className="kita-errors" role="alert">{initial.absenceError}</p>}
    {errors.length > 0 && <div className="kita-errors" role="alert" tabIndex={-1} ref={errorBox}><strong>Bitte prüfen:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
    {notice && <p className="kita-success" role="status">{notice}</p>}
    {!initial.absenceError && (editor ? <>
      <h2 tabIndex={-1} ref={heading}>{editor.mode === 'create' ? 'Abwesenheit eintragen' : 'Abwesenheit bearbeiten'}</h2>
      <form className="kita-card" noValidate onSubmit={submit}>
        <div className="employee-grid">
          <label>Mitarbeiter<select required value={editor.value.employeeId} onChange={event => change({ employeeId: event.target.value })}><option value="">Bitte auswählen</option>{!initial.employees.some(employee => employee.id === editor.value.employeeId) && editor.value.employeeId && <option value={editor.value.employeeId}>{editor.value.employeeName} (nicht mehr im Team)</option>}{initial.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          <label>Art<select value={editor.value.type} onChange={event => change({ type: event.target.value as Absence['type'] })}>{Object.entries(ABSENCE_TYPES).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
          <label>Startdatum<input type="date" required value={editor.value.startDate} onChange={event => change({ startDate: event.target.value })} /></label>
          <label>Enddatum<input type="date" required value={editor.value.endDate} onChange={event => change({ endDate: event.target.value })} /></label>
          <label>Umfang<select value={editor.value.portion} onChange={event => change({ portion: event.target.value as Absence['portion'] })}>{Object.entries(PORTIONS).map(([portion, label]) => <option key={portion} value={portion}>{label}</option>)}</select></label>
        </div>
        <p className="kita-help absence-hint">Start- und Enddatum zählen mit. Halbtage gelten für ein einzelnes Datum; bitte Start und Ende gleich setzen. Vormittag und Nachmittag sind Abschnitte, keine fest vorgegebenen Stunden.</p>
        {conflicts.length > 0 && <p role="status" className="absence-warning">Überschneidung mit {conflicts.map(item => `${ABSENCE_TYPES[item.type]} (${formatAbsence(item)})`).join(', ')}. Bitte Zeitraum bzw. halben Tag prüfen; so kann nicht gespeichert werden.</p>}
        <div className="kita-actions"><button className="kita-button" type="submit">Speichern bestätigen</button><button className="kita-button secondary" type="button" onClick={() => { setEditor(null); setErrors([]) }}>Abbrechen</button></div>
      </form>
    </> : <>
      <button className="kita-button" disabled={!!initial.teamError || !initial.employees.length} onClick={() => open(newAbsence(crypto.randomUUID()), 'create')}>Abwesenheit eintragen</button>
      {!initial.employees.length && !initial.teamError && <p className="kita-help absence-hint">Bitte zuerst unter <a href="#mitarbeiter">Mitarbeiter</a> eine Person anlegen. Bestehende Abwesenheiten bleiben erhalten.</p>}
      <section className="kita-card" aria-label="Abwesenheiten filtern"><div className="absence-filters">
        <label>Mitarbeiter filtern<select value={filters.employeeId} onChange={event => setFilters({ ...filters, employeeId: event.target.value })}><option value="">Alle Mitarbeiter</option>{[...filterPeople].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Zeitraum ab<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>Zeitraum bis<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
      </div><div className="kita-actions"><button className="kita-button secondary" onClick={() => setFilters(emptyFilters)}>Filter zurücksetzen</button></div>{invalidFilter && <p role="status" className="absence-warning">Das Ende des Filterzeitraums darf nicht vor dessen Beginn liegen.</p>}</section>
      <p className="kita-help" role="status">{visible.length} Einträge · chronologisch nach Beginn</p>
      {!visible.length && !invalidFilter && <section className="kita-card"><h2>{store.absences.length ? 'Keine passenden Abwesenheiten' : 'Noch keine Abwesenheiten'}</h2><p>{store.absences.length ? 'Passe den Mitarbeiter- oder Zeitraumfilter an.' : 'Neue Einträge erscheinen hier in zeitlicher Reihenfolge.'}</p></section>}
      <div className="absence-list">{visible.map(item => <article key={item.id} className="kita-card">
        <span className="status preview-status">{ABSENCE_TYPES[item.type]}</span><h2>{employeeName(item)}</h2><p>{formatAbsence(item)}</p>
        {findOverlaps(item, store.absences).length > 0 && <p className="absence-warning">Für diese Person überschneiden sich gespeicherte Abwesenheiten. Bitte die Einträge prüfen.</p>}
        <div className="kita-actions"><button className="kita-button secondary" disabled={!!initial.teamError} onClick={() => open(item, 'update')}>Bearbeiten<span className="employee-sr-only">: {employeeName(item)}, {formatAbsence(item)}</span></button><button className="kita-button secondary" onClick={() => { setDeleting(item.id); setErrors([]); setNotice('') }}>Löschen<span className="employee-sr-only">: {employeeName(item)}, {formatAbsence(item)}</span></button></div>
        {deleting === item.id && <div className="employee-delete" role="group" aria-label="Abwesenheit löschen bestätigen" ref={deleteBox} tabIndex={-1}><p>{ABSENCE_TYPES[item.type]} für {employeeName(item)} ({formatAbsence(item)}) wirklich löschen?</p><div className="kita-actions"><button className="kita-button" onClick={confirmDelete}>Endgültig löschen</button><button className="kita-button secondary" onClick={() => { setDeleting(null); setErrors([]) }}>Abbrechen</button></div></div>}
      </article>)}</div>
    </>)}
  </div>
}
