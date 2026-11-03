// Small, consistent 24px line icons; no runtime icon library needed.
export type IconName = 'dashboard' | 'kita' | 'mitarbeiter' | 'abwesenheiten' | 'dienstplan' | 'einstellungen' | 'menu' | 'arrow' | 'check' | 'coffee' | 'clock' | 'sparkles'
const paths: Record<IconName, string[]> = {
  dashboard: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'],
  kita: ['M4 21V7l8-4 8 4v14H4Z', 'M9 21v-5h6v5', 'M8 9h.01M16 9h.01M8 12h.01M16 12h.01'],
  mitarbeiter: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M16 3a4 4 0 0 1 0 8', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
  abwesenheiten: ['M3 12a9 9 0 0 1 18 0H3Z', 'M12 12v7a2 2 0 0 0 4 0', 'M12 3v-1'],
  dienstplan: ['M5 5h14a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a2 2 0 0 1 2-2Z', 'M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2M8 18h2'],
  einstellungen: ['m9 3-1 3-3 1-2 4 2 3v3l4 3 3-1 3 1 4-3v-3l2-3-2-4-3-1-1-3H9Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  arrow: ['M5 12h14m-5-5 5 5-5 5'],
  check: ['M20 11v1a8 8 0 1 1-5-7', 'm9 11 3 3L21 5'],
  coffee: ['M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8Z', 'M16 9h2a3 3 0 1 1 0 6h-2M7 2v2M12 2v2M2 23h16'],
  clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 6v6l4 2'],
  sparkles: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z', 'M20 2v4M18 4h4'],
}
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name].map((d, i) => <path key={i} d={d} />)}</svg>
}
