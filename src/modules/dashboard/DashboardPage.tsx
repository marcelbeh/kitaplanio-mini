import { useEffect, useState } from 'react'
import { loadSetup } from '../kita/setup'
import { loadEmployees } from '../mitarbeiter/employees'
import { loadInterview } from '../kita/interview'
import { Icon } from '../../shared/components/Icon'

function readOverview() {
  let groups: number | null = null
  let employees: number | null = null
  let completed = false
  let draft = false
  let interview: 'draft' | 'completed' | null = null
  const errors: string[] = []
  try {
    const kita = loadSetup(window.localStorage)
    completed = kita?.completed === true
    draft = !!kita && !completed
    groups = completed ? kita!.groups.length : 0
  } catch { errors.push('Kita-Einstellungen konnten nicht geladen werden. Vorhandene Daten bleiben unverändert.') }
  try { employees = loadEmployees(window.localStorage).employees.length }
  catch { errors.push('Mitarbeiterdaten konnten nicht geladen werden. Vorhandene Daten bleiben unverändert.') }
  try { interview = loadInterview(window.localStorage)?.status ?? null } catch { errors.push('Der Interview-Zwischenstand konnte nicht geladen werden. Vorhandene Daten bleiben unverändert.') }
  return { groups, employees, completed, draft, interview, errors }
}
export function DashboardPage() {
  const [overview] = useState(readOverview)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer) }, [])
  const greeting = now.getHours() < 11 ? 'Guten Morgen' : now.getHours() < 18 ? 'Guten Tag' : 'Guten Abend'
  return <div className="dashboard">
    <section className="dashboard-hero">
      <div><p className="eyebrow">Dein Kita-Alltag. Mit Überblick.</p><h1 id="page-title" tabIndex={-1}>{greeting}, Caro.</h1><p>Bereit für ein bisschen Planungszauber?</p><span className="hero-date">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      <img className="hero-giraffe" src="./brand/giraffe.svg" alt="" width="148" height="178" />
    </section>
    {overview.errors.map(error => <p key={error} className="kita-errors" role="alert">{error}</p>)}
    <div className="dashboard-metrics">
      <a href="#mitarbeiter" className="metric-card metric-lilac"><span className="metric-icon"><Icon name="mitarbeiter" /></span><strong>{overview.employees ?? '–'}</strong><span>Mitarbeiter</span><small>{overview.employees === null ? 'Daten nicht verfügbar' : 'Dein Team an einem Ort'}</small></a>
      <a href="#kita" className="metric-card metric-apricot"><span className="metric-icon"><Icon name="kita" /></span><strong>{overview.groups ?? '–'}</strong><span>Gruppen</span><small>{overview.groups === null ? 'Daten nicht verfügbar' : 'Aus abgeschlossener Einrichtung'}</small></a>
      <a href="#kita" className="metric-card metric-mint"><span className="metric-icon"><Icon name={overview.completed ? 'check' : 'clock'} /></span><strong className="metric-word">{overview.groups === null ? 'Nicht verfügbar' : overview.completed ? 'Eingerichtet' : overview.draft ? 'Im Entwurf' : 'Noch offen'}</strong><span>Kita-Einrichtung</span><small>{overview.completed ? 'Die Grundlage steht' : 'Schritt für Schritt einrichten'}</small></a>
    </div>
    <div className="dashboard-columns">
      <section className="surface week-preview">
        <div className="section-title"><div><p className="eyebrow">Raum für deine Woche</p><h2>Wochenübersicht</h2></div><span className="status preview-status"><Icon name="clock" />Vorschau</span></div>
        <p>Hier bekommt dein Wochenplan später seinen Platz.</p>
        <div className="week-skeleton" aria-label="Wochenplan-Vorschau ohne Planungsdaten">{['Mo', 'Di', 'Mi', 'Do', 'Fr'].map(day => <div className="week-preview-day" key={day}><span>{day}</span><div className="empty-shift" /><small>Noch kein Plan</small></div>)}</div>
        <div className="preview-note"><Icon name="dienstplan" /><p>Dienstplanung ist noch nicht verfügbar. Besetzung und Konflikte werden noch nicht berechnet.</p></div>
      </section>
      <aside className="surface next-steps"><span className="round-icon"><Icon name="sparkles" /></span><h2>Ein guter nächster Schritt</h2><p>{overview.interview === 'completed' ? 'Die Einrichtung ist abgeschlossen. Der Dienstplanbereich ist derzeit eine Vorschau.' : overview.interview === 'draft' ? 'Dein Interview ist zwischengespeichert. Du kannst genau dort weitermachen.' : !overview.completed ? 'Mit den Kita-Einstellungen schaffst du eine klare Grundlage für deinen Alltag.' : overview.employees === 0 ? 'Noch niemand an Bord? Dann holen wir dein Team dazu.' : 'Deine Kita und dein Team sind an einem Ort. Namen, Zeiten und Arbeitsregeln kannst du jederzeit prüfen.'}</p><a className="kita-button" href={overview.interview === 'completed' ? '#dienstplan' : overview.interview === 'draft' || !overview.completed ? '#kita' : '#mitarbeiter'}>{overview.interview === 'completed' ? 'Ersten Dienstplan erstellen' : overview.interview === 'draft' ? 'Interview fortsetzen' : !overview.completed ? 'Kita einrichten' : overview.employees === 0 ? 'Team anlegen' : 'Zum Team'}<Icon name="arrow" /></a><div className="coffee-note"><Icon name="coffee" /><span>Mit Liebe geplant.<br />Mit Köpfchen gemacht.</span></div></aside>
    </div>
  </div>
}
