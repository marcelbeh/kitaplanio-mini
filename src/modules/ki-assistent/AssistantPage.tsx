import { withDeadline } from '../../../supabase/functions/_shared/assistant-timeout'
import { useEffect, useRef, useState } from 'react'
import { cloudClient } from '../../cloud/client'
import { verifyCloudAccess } from '../../cloud/access'
import { appStorage, DIRTY_EVENT, WORKSPACE_EVENT } from '../../cloud/workspace'
import { calendarWeek, addDays, dateLabel, formatMinutes, localDate } from '../dienstplan/schedule'
import { StaffingCard } from '../dienstplan/StaffingCard'
import { calculateStaffing } from '../dienstplan/staffing'
import { analyticsReport } from '../auswertungen/analytics'
import { adoptAi, aiTimeSummary, aiPreview, aiWeekLabel, assertAiCurrent, localAnswerText, prepareAiSession } from './assistant'
import type { AiPreview } from './assistant'
import type { Task } from '../../../supabase/functions/_shared/assistant-protocol'
import '../kita/kita.css'
import '../dienstplan/schedule.css'
import './assistant.css'

const prompts: { task: Task; title: string; detail: string }[] = [
  { task: 'plan', title: 'Erstelle einen möglichst fairen Dienstplan.', detail: 'Zusätzliche Schichten für die ausgewählte Woche vorschlagen.' },
  { task: 'coverage', title: 'Wo fehlen uns Mitarbeitende?', detail: 'Die berechnete Besetzung dieser Woche erklären.' },
  { task: 'late', title: 'Wie sind die Spätdienste verteilt?', detail: 'Die vorhandene Dienstverteilung des ausgewählten Monats einordnen.' },
  { task: 'conflicts', title: 'Welche Konflikte gibt es?', detail: 'Die bestehende Regelprüfung dieser Woche erläutern.' },
]
export function AssistantPage() {
  const [date, setDate] = useState(() => addDays(calendarWeek(localDate()).monday, 7))
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [preview, setPreview] = useState<AiPreview | null>(null)
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [confirm, setConfirm] = useState(false)
  const controller = useRef<AbortController | null>(null), owner = useRef(''), writing = useRef(false)
  useEffect(() => {
    const reset = () => { controller.current?.abort(); setBusy(false); setPreview(null); setConfirm(false); setConsent(false); owner.current = '' }
    const { client } = cloudClient()
    const subscription = client?.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id ?? ''
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED' || owner.current && owner.current !== nextOwner) reset()
      owner.current = nextOwner
    })
    return () => { controller.current?.abort(); subscription?.data.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!preview) return
    const invalidate = () => {
      if (writing.current) return
      try { assertAiCurrent(appStorage, preview.session) }
      catch { setPreview(null); setConfirm(false); setError('Der Datenstand oder Arbeitsbereich wurde geändert. Bitte neu anfragen; die alte Vorschau ist verworfen.') }
    }
    const events = ['storage', 'focus', DIRTY_EVENT, WORKSPACE_EVENT]
    events.forEach(event => window.addEventListener(event, invalidate))
    return () => events.forEach(event => window.removeEventListener(event, invalidate))
  }, [preview])
  async function ask(task: Task) {
    if (!consent || busy) return
    setError(''); setMessage(''); setPreview(null); setConfirm(false); setBusy(true)
    const abort = new AbortController(); controller.current = abort
    const timer = setTimeout(() => abort.abort('timeout'), 40000)
    try {
      if (!navigator.onLine) throw Error('Du bist offline. Die regelbasierte Planung bleibt im Dienstplan verfügbar.')
      const { client, message } = cloudClient()
      if (!client) throw Error(message)
      const access = await withDeadline(() => verifyCloudAccess(client), abort.signal)
      if (!access.connected || !access.userId) throw Error(access.message || 'Bitte zuerst mit einem freigeschalteten caro.-Konto anmelden.')
      if (abort.signal.aborted) return
      owner.current = access.userId
      const session = prepareAiSession(appStorage, task, date)
      if (session.workspace && session.workspace !== owner.current) throw Error('Bitte zuerst das zum Cloud-Arbeitsbereich gehörende Konto anmelden.')
      const { data, error: invocationError } = await withDeadline(() => client.functions.invoke('caro-assistant', { body: session.request, signal: abort.signal, timeout: 35000 }), abort.signal)
      if (abort.signal.aborted) return
      if (invocationError) {
        let text = 'KI-Verbindung fehlgeschlagen. Bitte Anmeldung und Edge-Function-Einrichtung prüfen oder später erneut versuchen.'
        const response = invocationError.context
        if (response instanceof Response) { try { const value = await withDeadline(() => response.json(), abort.signal); if (typeof value?.error === 'string' && value.error.length <= 500) text = value.error } catch { /* Keep the bounded generic error; no raw upstream text. */ } }
        throw Error(text)
      }
      const current = await withDeadline(() => verifyCloudAccess(client), abort.signal)
      if (abort.signal.aborted) return
      if (!current.connected || current.userId !== owner.current) throw Error('Die Anmeldung hat sich geändert. Bitte erneut anfragen.')
      assertAiCurrent(appStorage, session)
      setPreview(aiPreview(session, data))
    } catch (error) { if (abort.signal.reason === 'timeout') setError('Die Anfrage hat zu lange gedauert. Bitte manuell erneut versuchen; es wurde nichts gespeichert.'); else if (!abort.signal.aborted) setError(error instanceof Error ? error.message : 'KI-Anfrage fehlgeschlagen; es wurde nichts gespeichert.') }
    finally { clearTimeout(timer); if (!abort.signal.aborted || abort.signal.reason === 'timeout') setBusy(false) }
  }
  async function adopt() {
    if (!preview || !confirm || busy) return
    setBusy(true); setError('')
    const abort = new AbortController(); controller.current = abort
    const timer = setTimeout(() => abort.abort('timeout'), 40000)
    try {
      const { client } = cloudClient()
      if (!client) throw Error('Bitte zuerst erneut anmelden.')
      const access = await withDeadline(() => verifyCloudAccess(client), abort.signal)
      if (abort.signal.aborted) return
      if (!access.connected || access.userId !== owner.current) throw Error('Die Konto-Freigabe hat sich geändert. Bitte erneut anfragen.')
      writing.current = true
      let count: number
      try { count = adoptAi(appStorage, preview, true) } finally { writing.current = false }
      setPreview(null); setConfirm(false); setMessage(`${count} neue Schichten gemeinsam im aktuellen Arbeitsbereich gespeichert. Es wurde nichts veröffentlicht. Eine Cloud-Synchronisierung erfolgt weiterhin nur manuell.`)
    } catch (error) { if (abort.signal.reason === 'timeout') setError('Die Konto-Prüfung hat zu lange gedauert; es wurde nichts gespeichert.'); else if (!abort.signal.aborted) setError((error as Error).message) }
    finally { clearTimeout(timer); if (!abort.signal.aborted || abort.signal.reason === 'timeout') setBusy(false) }
  }
  const hard = preview?.issues.filter(issue => issue.kind === 'conflict').length ?? 0
  const planning = preview?.session.request.task === 'plan'
  const combined = preview ? [...preview.session.context.shifts, ...preview.draft.proposal.shifts] : []
  const report = preview ? analyticsReport({ ...preview.session.context, shifts: combined }, preview.session.request.task === 'late' ? 'month' : 'week', preview.session.request.from) : null
  return <section className="employee-page ai-page">
    <header className="page-heading"><div><p className="eyebrow">Mit Bedacht geplant</p><h1 id="page-title" tabIndex={-1}>KI-Assistent</h1><p>Gemini erklärt und schlägt vor. Deine Regeln prüfen, du entscheidest.</p></div><a className="kita-button secondary" href="#dienstplan">Zum Dienstplan</a></header>
    <div className="ai-layout"><section className="kita-card ai-controls" aria-label="KI-Anfrage">
      <h2>Was möchtest du wissen?</h2>
      <label>Datum in der gewünschten Woche / im Monat<input type="date" min="0002-01-01" max="9998-12-31" value={date} disabled={busy} onChange={event => { setDate(event.target.value); setPreview(null); setConfirm(false); setError('') }} /></label>
      <p className="kita-help"><strong>Externe KI-Verarbeitung:</strong> Planungszeiten, Vertragsminuten und Abwesenheitszeiträume ohne Gründe werden pseudonymisiert an Google Gemini übertragen. Namen bleiben lokal. Diese Daten können weiterhin personenbezogen sein.</p>
      <details><summary>Datenschutz und Grenzen</summary><p>Die Anfrage überträgt erforderliche Planungsdaten über die Supabase Edge Function an Google Gemini: Zeiträume, temporäre Personen-/Gruppen-IDs, Arbeitsrahmen, Vertragsminuten, Wünsche, Schichten, Abwesenheitszeiträume ohne Gründe und berechnete Kennzahlen. Namen und die Zuordnung zu IDs bleiben in deiner App. Pseudonymisierte Daten können weiterhin personenbezogen sein.</p><p>Keine E-Mails, Freitextregeln, Terminnotizen, Abwesenheitsgründe oder Chatverläufe werden übertragen. Der Assistent speichert keine Gespräche. Für die externe Verarbeitung gelten die Bedingungen und Datenschutzhinweise des eingerichteten Google-Gemini-Tarifs; diese vor Nutzung prüfen.</p><p>Freitextregeln werden nur als manuell zu prüfen gekennzeichnet. Unklare Halbtage und Muss-Freitextregeln sperren neue KI-Zuordnungen. Ohne ausdrücklich konfigurierten Sonderbedarf entstehen keine Wochenenddienste. Pausen neuer Dienste bleiben offen. Es gibt keine Rechtsprüfung und keine Garantie optimaler Planung.</p><a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini-API-Bedingungen und Datenverwendung</a></details>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => { setConsent(event.target.checked); setPreview(null); setConfirm(false) }} />Ich verwende ausschließlich fiktive Personaldaten und stimme der beschriebenen externen KI-Verarbeitung für diese Sitzung aktiv zu.</label>
      <p className="kita-help">Jede Frage sendet eine neue, strukturierte Einzelanfrage. Nur mit freigeschaltetem caro.-Konto. Du kannst auch deinen lokalen Arbeitsbereich bewusst analysieren; es erfolgt keine Cloud-Erstübernahme.</p>
      <div className="ai-prompts">{prompts.map(prompt => <button className="ai-prompt" key={prompt.task} disabled={!consent || busy || !date} onClick={() => void ask(prompt.task)}><strong>{prompt.title}</strong><span>{prompt.detail}</span></button>)}</div>
      <a href="#dienstplan">Ohne KI regelbasiert planen</a>
    </section><div className="ai-results" aria-live="polite" aria-busy={busy}>
      {busy && <p role="status">Anfrage wird geprüft … bitte warten.</p>}
      {error && <p className="kita-errors" role="alert">{error} Die bisherigen Daten bleiben erhalten.</p>}
      {message && <p className="kita-card" role="status">{message}</p>}
      {!preview && !busy && <section className="kita-card"><h2>Ein zweiter Blick auf deinen Plan</h2><p>Wähle eine Frage. Die Antwort und alle Schichten erscheinen zuerst hier als Vorschau. Keine Speicherung ohne Bestätigung.</p><p className="kita-help">Die Fragen beziehen sich auf dein gewähltes Datum; vorgeschlagen ist zunächst die kommende Woche. Für freie Sonderfälle nutze weiterhin die manuelle Planung.</p></section>}
      {preview && <>
        <section className="kita-card"><p className="eyebrow">KI-Einschätzung · bitte fachlich prüfen</p><h2>{planning ? 'Vorschau · noch nicht gespeichert' : 'Analyse · keine Datenänderung'}</h2><p>{aiWeekLabel(preview.session)}</p><p className="ai-text">{localAnswerText(preview.answer.summary, preview.session)}</p><ul>{preview.answer.warnings.map((text, i) => <li key={i}>{localAnswerText(text, preview.session)}</li>)}</ul><p className="kita-help">Die KI kann sich irren. Die folgenden lokalen Berechnungen und Prüfungen sind maßgeblich; KI-Text kann sie nicht aufheben.</p></section>
        {planning && <section className="kita-card"><h2>{preview.draft.proposal.shifts.length} vorgeschlagene neue Schichten</h2><p>{hard} harte Konflikte · {preview.issues.length - hard} Hinweise · {preview.blockers.length} zusätzliche Übernahmesperren</p><div className="ai-shifts">{preview.draft.proposal.shifts.map((shift, i) => <article key={shift.id}><strong>{shift.employeeName} · {dateLabel(shift.date)}</strong><span>{preview.session.context.setup?.groups.find(group => group.id === shift.groupId)?.name} · {shift.start}–{shift.end}</span><small>Pause nicht festgelegt · Brutto {formatMinutes(aiTimeSummary([shift]).gross)} · Netto ungeklärt</small><p>{localAnswerText(preview.answer.shifts[i].reason, preview.session)}</p></article>)}</div><ul className="kita-errors">{preview.blockers.map((text, i) => <li key={i}>{text}</li>)}</ul>
          <div className="kita-actions"><button className="kita-button" disabled={busy || !!hard || !!preview.blockers.length || !preview.draft.proposal.shifts.length} onClick={() => setConfirm(true)}>Vorschlag übernehmen</button><button className="kita-button secondary" disabled={busy} onClick={() => { setPreview(null); setConfirm(false) }}>Verwerfen</button></div>
          {confirm && <div className="generator-confirm" role="group" aria-label="KI-Übernahme bestätigen"><p>{preview.draft.proposal.shifts.length} neue Schichten mit den angezeigten Hinweisen gemeinsam speichern? Vorhandene Dienste bleiben unverändert. Pausen und Nettozeiten sind ungeklärt und müssen anschließend manuell erfasst bzw. geprüft werden. Die angezeigte Bruttozeit ist keine bestätigte Nettoarbeitszeit.</p><div className="kita-actions"><button className="kita-button" disabled={busy} onClick={() => void adopt()}>Übernahme ausdrücklich bestätigen</button><button className="kita-button secondary" disabled={busy} onClick={() => setConfirm(false)}>Zurück</button></div></div>}
        </section>}
        {!!preview.issues.length && <section className="kita-card"><h2>Verbindliche lokale Planprüfung</h2><ul>{preview.issues.map(issue => <li key={issue.id}><strong>{issue.kind === 'conflict' ? 'Konflikt' : 'Hinweis'} · {dateLabel(issue.date)} · {issue.person}</strong><p>{issue.cause}</p><small>{issue.correction}</small></li>)}</ul></section>}
        {preview.session.request.task !== 'late' && <section className="kita-card"><h2>Personalampel {planning ? 'mit Vorschlag' : 'des bestehenden Plans'}</h2><div className="ai-days">{calendarWeek(preview.session.request.from).days.filter((date, i) => i < 5 || combined.some(shift => shift.date === date) || preview.session.request.events.some(event => event.date === date)).map(date => <article key={date}><h3>{dateLabel(date)}</h3>{aiTimeSummary(combined.filter(shift => shift.date === date)).missing ? <p className="staffing-status staffing-check">? Prüfen · Pausen noch nicht festgelegt. Keine belastbare Besetzungsampel.</p> : <StaffingCard day={calculateStaffing(date, preview.session.context.setup, combined, preview.session.context.absences, preview.session.context.employees)} />}</article>)}</div></section>}
        {report && <section className="kita-card"><h2>Berechnete Stunden und Dienstverteilung</h2><p className="kita-help">Je Dienstart/Tag einmal gezählt. Netto mit vorhandenen Pausen; fehlende Pausen bleiben ungeklärt. Unterschiede allein belegen keine Unfairness.</p><ul>{report.rows.map(person => <li key={person.id}><strong>{person.name}</strong>: {person.missingBreak || person.net === null ? 'Netto ungeklärt' : `${formatMinutes(person.net)} netto`} · Früh {person.early ?? '—'} · Kern {person.core ?? '—'} · Spät {person.late ?? '—'} · Wochenende {person.weekend ?? '—'}</li>)}</ul></section>}
      </>}
    </div></div>
  </section>
}
