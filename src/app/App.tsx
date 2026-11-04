import { WORKSPACE_EVENT, appStorage } from '../cloud/workspace'
import { SettingsPage } from '../modules/einstellungen/SettingsPage'
import { CloudAccount } from '../cloud/CloudAccount'
import { useEffect, useRef, useState } from 'react'
import { modules } from '../modules'
import { KitaPage } from '../modules/kita/KitaPage'
import { EmployeesPage } from '../modules/mitarbeiter/EmployeesPage'
import { SchedulePage } from '../modules/dienstplan/SchedulePage'
import { EventsPage } from '../modules/termine/EventsPage'
import { AbsencesPage } from '../modules/abwesenheiten/AbsencesPage'
import { DashboardPage } from '../modules/dashboard/DashboardPage'
import { Icon } from '../shared/components/Icon'
import { shouldStartInterview } from '../modules/kita/interview'

function currentModule() {
  if (!window.location.hash) {
    try { if (shouldStartInterview(appStorage)) return modules.find(module => module.id === 'kita')! } catch { /* Keep the dashboard available when local data cannot be read. */ }
  }
  return modules.find(module => module.id === window.location.hash.slice(1)) ?? modules[0]
}
const mobileItems = [
  { id: 'dashboard', label: 'Start' },
  { id: 'dienstplan', label: 'Plan' },
  { id: 'mitarbeiter', label: 'Team' },
] as const

export function App() {
  const [active, setActive] = useState(currentModule)
  const [moreOpen, setMoreOpen] = useState(false)
  const [workspaceRevision, setWorkspaceRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setWorkspaceRevision(value => value + 1)
    window.addEventListener(WORKSPACE_EVENT, refresh)
    return () => window.removeEventListener(WORKSPACE_EVENT, refresh)
  }, [])
  const moreButton = useRef<HTMLButtonElement>(null)
  const morePanel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onHashChange = () => {
      // The skip link targets content within the current area, not a new route.
      if (window.location.hash === '#main-content') return
      setActive(currentModule())
      setMoreOpen(false)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  useEffect(() => {
    document.title = `${active.title} · caro.`
    document.getElementById('page-title')?.focus()
  }, [active])
  useEffect(() => {
    if (!moreOpen) return
    morePanel.current?.querySelector('a')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMoreOpen(false); moreButton.current?.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [moreOpen])
  const moreActive = !mobileItems.some(item => item.id === active.id)
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Zum Inhalt</a>
    <aside className="sidebar">
      <a className="brand" href="#dashboard" aria-label="caro. – Start"><img src="./brand/logo-dark.svg" width="205" height="65" alt="caro." /></a>
      <p className="sidebar-kicker">Dein Kita-Alltag</p>
      <nav className="desktop-nav" aria-label="Hauptnavigation">{modules.map(module => <a key={module.id} href={`#${module.id}`} aria-current={active.id === module.id ? 'page' : undefined}><Icon name={module.id === 'monatsplan' ? 'dienstplan' : module.id} /><span>{module.title}</span></a>)}</nav>
      <div className="sidebar-bottom"><span className="sidebar-flourish" aria-hidden="true">caro.</span><p>Mit Herz geplant.</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><a className="mobile-brand" href="#dashboard" aria-label="caro. – Start"><img src="./brand/logo-light.svg" width="165" height="53" alt="caro." /></a><div className="breadcrumb"><span>caro.</span><span aria-hidden="true">/</span><strong>{active.title}</strong></div><CloudAccount /></header>
      <main key={workspaceRevision} id="main-content" tabIndex={-1}>
        {active.id === 'dashboard' ? <DashboardPage /> : active.id === 'kita' ? <KitaPage /> : active.id === 'mitarbeiter' ? <EmployeesPage /> : active.id === 'abwesenheiten' ? <AbsencesPage /> : active.id === 'termine' ? <EventsPage /> : active.id === 'dienstplan' || active.id === 'monatsplan' ? <SchedulePage initialView={active.id === 'monatsplan' ? 'month' : 'week'} onViewChange={view => { window.location.hash = view === 'month' ? '#monatsplan' : '#dienstplan' }} /> : <SettingsPage />}
      </main>
      <footer><span>caro.</span><span>Mit Herz geplant.</span></footer>
    </div>
    {moreOpen && <div className="mobile-more" id="mobile-more" ref={morePanel}><div className="more-heading"><strong>Mehr für deinen Kita-Alltag</strong><button type="button" onClick={() => { setMoreOpen(false); moreButton.current?.focus() }}>Schließen</button></div>{modules.filter(module => !mobileItems.some(item => item.id === module.id)).map(module => <a key={module.id} href={`#${module.id}`} aria-current={active.id === module.id ? 'page' : undefined} onClick={() => { setMoreOpen(false); if (active.id === module.id) document.getElementById('page-title')?.focus() }}><Icon name={module.id === 'monatsplan' ? 'dienstplan' : module.id} />{module.title}</a>)}</div>}
    <nav className="bottom-nav" aria-label="Mobile Hauptnavigation">{mobileItems.map(item => <a key={item.id} href={`#${item.id}`} aria-current={active.id === item.id ? 'page' : undefined}><Icon name={item.id} /><span>{item.label}</span></a>)}<button ref={moreButton} type="button" aria-expanded={moreOpen} aria-controls={moreOpen ? 'mobile-more' : undefined} className={moreActive || moreOpen ? 'is-active' : ''} onClick={() => setMoreOpen(!moreOpen)}><Icon name="menu" /><span>Mehr</span></button></nav>
  </div>
}
