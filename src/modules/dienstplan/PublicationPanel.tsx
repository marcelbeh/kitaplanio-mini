import { appStorage } from '../../cloud/workspace'
import { useEffect, useState } from 'react'
import type { PlanIssue } from './checks'
import { loadPublications, preparePublication, publicationStatus, publishWeek } from './publications'
import type { PublishedPlan, PublicationToken, TeamPlan } from './publications'

function readVersions() {
  try { return { plans: loadPublications(appStorage).plans, error: '' } }
  catch (error) { return { plans: [] as PublishedPlan[], error: (error as Error).message } }
}
export function PublicationPanel({ plan, selected, onSelect, issues, locked, unavailable }: { plan: TeamPlan; selected: PublishedPlan | null; onSelect: (value: PublishedPlan | null) => void; issues: PlanIssue[]; locked: boolean; unavailable: boolean }) {
  const [versions, setVersions] = useState(readVersions)
  const [token, setToken] = useState<PublicationToken | null>(null)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const signature = JSON.stringify(plan)
  useEffect(() => { setToken(null); setError(''); setNotice('') }, [signature, locked])
  useEffect(() => {
    const reload = () => setVersions(readVersions())
    window.addEventListener('storage', reload); window.addEventListener('focus', reload)
    return () => { window.removeEventListener('storage', reload); window.removeEventListener('focus', reload) }
  }, [])
  const plans = versions.plans.filter(item => item.from === plan.from).sort((a, b) => b.version - a.version)
  const hard = issues.filter(issue => issue.kind === 'conflict').length
  const hints = issues.length - hard
  function prepare() {
    try { setToken(preparePublication(appStorage, plan.from)); setError(''); setNotice('') }
    catch (error) { setError((error as Error).message) }
  }
  function confirm() {
    if (!token) return
    try { const published = publishWeek(appStorage, token, true); setVersions(readVersions()); setToken(null); onSelect(published); setNotice(`Version ${published.version} lokal veröffentlicht.`); setError('') }
    catch (error) { setError((error as Error).message); setToken(null) }
  }
  const printDisabled = locked || !selected && unavailable
  return <section id="schedule-publication" tabIndex={-1} className="kita-card publication-panel employee-page" aria-label="Freigabe, Versionen und Druck">
    <h2>Freigabe und Druck</h2><p role="status">Arbeitsplan: <strong>{publicationStatus(plan, versions.plans)}</strong>{plans[0] && ` · letzte Freigabe: Version ${plans[0].version}`}</p>
    <p className="kita-help">Freigaben bleiben ausschließlich lokal in diesem Browser. Es wird nichts versendet oder öffentlich bereitgestellt.</p>
    {versions.error && <p role="alert" className="kita-errors">{versions.error}</p>}{error && <p role="alert" className="kita-errors">{error}</p>}{notice && <p role="status" className="kita-success">{notice}</p>}
    <label>Ansicht und Druckquelle<select id="schedule-print-source" disabled={locked} value={selected?.version ?? 'working'} onChange={event => { onSelect(event.target.value === 'working' ? null : plans.find(plan => plan.version === Number(event.target.value)) ?? null); setToken(null) }}><option value="working">Aktueller Entwurf · Arbeitsplan</option>{plans.map(plan => <option key={plan.version} value={plan.version}>Veröffentlicht · Version {plan.version} · {new Date(plan.publishedAt).toLocaleString('de-DE')}</option>)}</select></label>
    <p className="kita-help">Druckquelle: {selected ? `unveränderliche veröffentlichte Version ${selected.version}` : 'aktueller Entwurf, nicht veröffentlicht'}. „Als PDF speichern“ öffnet den Druckdialog; dort „Als PDF sichern/speichern“ wählen.</p>
    <div className="kita-actions"><button className="kita-button" disabled={locked || !!selected || unavailable || hard > 0 || !!versions.error} onClick={prepare}>Dienstplan veröffentlichen</button><button className="kita-button secondary" disabled={printDisabled} onClick={() => window.print()}>Als PDF speichern</button><button className="kita-button secondary" disabled={printDisabled} onClick={() => window.print()}>Drucken</button></div>
    {selected && <p className="kita-help">Für eine neue Freigabe zuerst „Aktueller Entwurf“ auswählen. Veröffentlicht wird ausschließlich der gespeicherte Arbeitsplan.</p>}
    {locked ? <p className="kita-help">Generatorvorschau erst übernehmen oder verwerfen. Sie wird nicht veröffentlicht.</p> : <p className="kita-help">{hard} harte Konflikte verhindern ggf. die Freigabe · {hints} Hinweise bleiben in der Planprüfung sichtbar. Jede erneute Freigabe erhält eine neue Version.</p>}
    {token && <div className="publication-confirm" role="group" aria-label="Veröffentlichung bestätigen"><p>Diese Kalenderwoche als unveränderliche Version {(plans[0]?.version ?? 0) + 1} lokal veröffentlichen? {hints} Hinweise bleiben zur Entscheidung der Leitung. Bestehende Versionen werden nicht überschrieben.</p><div className="kita-actions"><button className="kita-button" onClick={confirm}>Veröffentlichung bestätigen</button><button className="kita-button secondary" onClick={() => setToken(null)}>Abbrechen</button></div></div>}
  </section>
}
