import { useEffect, useState } from 'react'
import { modules } from '../modules'
import { PlaceholderPage } from '../shared/components/PlaceholderPage'

function currentModule() {
  return modules.find((module) => module.id === window.location.hash.slice(1)) ?? modules[0]
}

export function App() {
  const [active, setActive] = useState(currentModule)

  useEffect(() => {
    const onHashChange = () => setActive(currentModule())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    document.title = `${active.title} · KitaPlanio Lite`
    document.getElementById('page-title')?.focus()
  }, [active])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Zum Inhalt</a>
      <aside className="sidebar">
        <a className="brand" href="#dashboard" aria-label="KitaPlanio Lite – Dashboard">
          <img src="/favicon.svg" width="40" height="40" alt="" />
          <span>KitaPlanio <small>Lite</small></span>
        </a>
        <nav aria-label="Hauptnavigation">
          {modules.map((module) => (
            <a key={module.id} href={`#${module.id}`} aria-current={active.id === module.id ? 'page' : undefined}>
              <span className="nav-marker" aria-hidden="true" />{module.title}
            </a>
          ))}
        </nav>
        <p className="sidebar-note">Raum für einen klaren Kita-Alltag.</p>
      </aside>
      <div className="workspace">
        <header className="topbar"><span>Dein Kita-Alltag</span><span className="edition">KitaPlanio Lite</span></header>
        <main id="main-content"><PlaceholderPage title={active.title} description={active.description} /></main>
        <footer>Einfach organisiert. Gemeinsam geplant.</footer>
      </div>
    </div>
  )
}
