import { useEffect, useState } from 'react'
import { appStorage } from '../../cloud/workspace'
import { calendarWeek, dateLabel, formatMinutes, localDate } from '../dienstplan/schedule'
import { analyticsReport, moveReport, readAnalyticsData, reportRange, sortReport } from './analytics'
import type { AnalyticsRow, PeriodMode, SortKey } from './analytics'
import '../kita/kita.css'
import './analytics.css'

const labels = { net: 'Geplante Nettozeit', early: 'Früh', core: 'Kern', late: 'Spät', weekend: 'Wochenende' } as const
const metricKeys = ['net', 'early', 'core', 'late', 'weekend'] as const
const value = (key: typeof metricKeys[number], count: number | null) => count === null ? '—' : key === 'net' ? formatMinutes(count) : count
export function AnalyticsPage() {
  const [data, setData] = useState(() => readAnalyticsData(appStorage)), [mode, setMode] = useState<PeriodMode>('week')
  const [date, setDate] = useState(localDate), [group, setGroup] = useState(''), [sort, setSort] = useState<SortKey>('name'), [error, setError] = useState('')
  useEffect(() => {
    const reload = () => setData(readAnalyticsData(appStorage))
    window.addEventListener('storage', reload); window.addEventListener('focus', reload)
    return () => { window.removeEventListener('storage', reload); window.removeEventListener('focus', reload) }
  }, [])
  const groups = data.setup?.groups ?? [], filter = groups.some(item => item.id === group) ? group : ''
  const report = analyticsReport(data, mode, date, filter), rows = sortReport(report.rows, sort)
  const title = mode === 'week' ? `KW ${calendarWeek(date).week} · ${calendarWeek(date).year}` : new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${report.from}T00:00:00Z`))
  function navigate(next: string, nextMode = mode) {
    try { reportRange(nextMode, next); setDate(next); setMode(nextMode); setError('') } catch (error) { setError((error as Error).message) }
  }
  function move(offset: number) { try { navigate(moveReport(mode, date, offset)) } catch (error) { setError((error as Error).message) } }
  function context(row: AnalyticsRow) {
    return <div className="analytics-context"><span>{groups.find(item => item.id === row.groupId)?.name ?? 'Gruppenzuordnung ungeklärt'}</span><span>{row.historical ? data.unavailable?.employees ? 'Stammdaten nicht lesbar' : 'Historische Zuordnung · nicht mehr in den Stammdaten' : row.planned === null ? 'Schichten ungeklärt' : row.planned ? 'Im Zeitraum geplant' : 'Keine Schichten im Zeitraum'}</span><span>Aktueller Vertrag/Woche: {row.contract === null ? 'nicht bekannt' : formatMinutes(row.contract)} · Arbeitsrahmen: {row.availability ?? 'unbekannt'}</span><span>{row.absence === null ? 'Abwesenheiten ungeklärt' : row.absence ? 'Abwesenheit im Zeitraum erfasst' : 'Keine Abwesenheit im Zeitraum erfasst'}</span>{row.missingBreak && <span>Pausenangabe unvollständig</span>}</div>
  }
  function metrics(counts: typeof report.totals) {
    return <dl className="analytics-values">{metricKeys.map(key => <div key={key}><dt>{labels[key]}</dt><dd>{value(key, counts[key])}{key === 'net' && <small> HH:MM</small>}</dd></div>)}</dl>
  }
  return <div className="kita-setup analytics-page">
    <div className="page-heading"><p className="eyebrow">caro.</p><h1 id="page-title" tabIndex={-1}>Auswertungen</h1><p>Geplante Arbeitsstunden und Dienstverteilung – ausschließlich lesend.</p></div>
    <section className="kita-card analytics-controls" aria-label="Auswertungszeitraum">
      <div className="kita-actions" role="group" aria-label="Zeitraumart"><button className="kita-button secondary" aria-pressed={mode === 'week'} onClick={() => navigate(date, 'week')}>Kalenderwoche</button><button className="kita-button secondary" aria-pressed={mode === 'month'} onClick={() => navigate(date, 'month')}>Kalendermonat</button></div>
      <h2 aria-live="polite">{title}</h2><p>{dateLabel(report.from)}–{dateLabel(report.to)}</p>
      <div className="kita-actions"><button className="kita-button secondary" aria-label="Vorheriger Zeitraum" onClick={() => move(-1)}>← Zurück</button><button className="kita-button secondary" onClick={() => navigate(localDate())}>Heute</button><button className="kita-button secondary" aria-label="Nächster Zeitraum" onClick={() => move(1)}>Weiter →</button></div>
      <div className="employee-grid"><label>{mode === 'week' ? 'Datum in der Kalenderwoche' : 'Kalendermonat'}<input key={mode} type={mode === 'week' ? 'date' : 'month'} min={mode === 'week' ? '0002-01-01' : '0002-01'} max={mode === 'week' ? '9998-12-31' : '9998-12'} value={mode === 'week' ? date : date.slice(0, 7)} onChange={event => navigate(mode === 'week' ? event.target.value : `${event.target.value}-01`)} /></label>
      <label>Stammgruppe<select value={filter} onChange={event => setGroup(event.target.value)}><option value="">Gesamtes Team</option>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Sortieren nach<select value={sort} onChange={event => setSort(event.target.value as SortKey)}><option value="name">Name · A–Z</option>{metricKeys.map(key => <option key={key} value={key}>{labels[key]} · absteigend</option>)}</select></label></div>
      {error && <p className="kita-errors" role="alert">{error}</p>}
    </section>
    {data.errors?.map(message => <p className="kita-errors" role="alert" key={message}>{message}</p>)}
    {!!data.errors?.length && <button className="kita-button secondary" onClick={() => setData(readAnalyticsData(appStorage))}>Daten erneut lesen</button>}
    <p className="kita-help">Früh/Kern/Spät folgen den aktuell hinterlegten Kita-Zeiten. Netto nach erfassten Pausen; fehlende Pausenangaben lösen keinen Standardabzug aus. Jeder Diensttag zählt je Person pro Art höchstens einmal, auch bei Teilschichten. Früh/Kern/Spät können am selben Tag zusammentreffen – Schichtstunden werden unabhängig davon jeweils einmal addiert. Wochenenden zählen nur bei tatsächlich gespeicherten Schichten.</p>
    {!report.classificationKnown && <p className="kita-lock-note">Dienstarten sind ohne verlässliche Kita-Zeiten oder Schichtdaten nicht bestimmbar (—). Es werden keine Zeitgrenzen angenommen.</p>}
    <section className="kita-card" aria-label="Team-Gesamtsummen"><h2>Summe der Auswahl · {rows.length} Personen</h2>{metrics(report.totals)}</section>
    {report.empty && <p className="kita-lock-note">Keine Schichten in diesem Zeitraum und dieser Auswahl gespeichert. Vorhandene Stammdaten bzw. historische Einträge bleiben sichtbar.</p>}
    <section className="kita-card analytics-fairness" aria-label="Dienstverteilung einordnen"><details><summary>Früh-/Spätverteilung einordnen · {report.warningsAvailable ? `${report.warnings.length} Prüfhinweise` : 'Daten ungeklärt'}</summary>
      <p>Die Hinweise basieren auf aktuellen Stammdaten, nicht auf einer Vertrags-/Verfügbarkeitshistorie. Die bestehende Wochenprüfung vergleicht nur vergleichbare Voraussetzungen und gewichtet Vertragsstunden. Abwesenheiten, Arbeitsrahmen und feste Vorgaben können Vergleiche ausschließen; Wünsche und Teilpläne können Unterschiede erklären. Hinweise sind keine Feststellung von Ungerechtigkeit und kein Fairness-Score.</p>
      <p className="kita-help">Im Monat werden nur vollständig enthaltene ISO-Wochen verglichen. Randwochen bleiben ohne Verteilungsbewertung; deren Stunden und Dienste sind trotzdem enthalten. Vertragswerte sind ausschließlich Wocheninformationen – keine Monats-Sollstunden, Überstunden oder Gutschriften für Abwesenheiten.</p>
      {!report.warningsAvailable ? <p>Für verlässliche Verteilungshinweise fehlen lesbare Stammdaten, Abwesenheiten oder Betreuungszeiten.</p> : !report.warnings.length ? <p>Keine zusätzlichen Hinweise aus der vorhandenen Wochenprüfung.</p> : <ul>{report.warnings.map((warning, index) => <li key={`${warning.week}-${index}`}><strong>KW {calendarWeek(warning.week).week}/{calendarWeek(warning.week).year}:</strong> {warning.text}</li>)}</ul>}
    </details></section>
    {!rows.length ? <section className="kita-card"><h2>Keine Personen für diese Auswahl</h2><p>Es sind weder aktuelle Mitarbeitende noch historische Einträge vorhanden.</p><a className="kita-button secondary" href="#mitarbeiter">Zum Team</a></section> : <>
      <div className="analytics-desktop" role="region" aria-label="Mitarbeiterauswertung" tabIndex={0}><table className="analytics-table"><caption>{title} · Stunden und Diensttage der Auswahl</caption><thead><tr><th scope="col">Mitarbeiter</th>{metricKeys.map(key => <th scope="col" key={key}>{labels[key]}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><th scope="row">{row.name}{context(row)}</th>{metricKeys.map(key => <td key={key}>{value(key, row[key])}</td>)}</tr>)}</tbody><tfoot><tr><th scope="row">Summe der Auswahl</th>{metricKeys.map(key => <td key={key}>{value(key, report.totals[key])}</td>)}</tr></tfoot></table></div>
      <div className="analytics-mobile">{rows.map(row => <article className="kita-card" key={row.id}><h3 className="analytics-person">{row.name}</h3>{metrics(row)}{context(row)}</article>)}</div>
    </>}
  </div>
}
