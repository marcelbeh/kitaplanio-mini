import { Icon } from './Icon'
type Props = { title: string; description: string }
export function PlaceholderPage({ title, description }: Props) {
  return <>
    <div className="page-heading"><p className="eyebrow">KitaPlanio Lite</p><h1 id="page-title" tabIndex={-1}>{title}</h1><p>{description}</p></div>
    <section className="placeholder surface" aria-label={`${title}: Vorschau`}>
      <span className="round-icon"><Icon name="sparkles" /></span><span className="status preview-status">Vorschau</span><h2>Hier wächst etwas Gutes.</h2><p>Dieser Bereich ist noch nicht verfügbar.<br />Deine Kita und dein Team kannst du schon jetzt einrichten.</p><a className="kita-button secondary" href="#dashboard">Zur Startseite<Icon name="arrow" /></a>
    </section>
  </>
}
