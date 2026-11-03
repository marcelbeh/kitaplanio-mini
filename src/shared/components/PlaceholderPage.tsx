type Props = { title: string; description: string }

export function PlaceholderPage({ title, description }: Props) {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">KitaPlanio Lite</p>
        <h1 id="page-title" tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
      <section className="placeholder" aria-label={`${title}: Entwicklungsstand`}>
        <div className="placeholder-symbol" aria-hidden="true">✦</div>
        <span className="status">Projektfundament</span>
        <h2>Platz für das Wesentliche</h2>
        <p>Dieser Bereich wird in einem späteren Schritt ergänzt.</p>
      </section>
    </>
  )
}
