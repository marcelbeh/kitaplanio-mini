// Neue Module hier registrieren und ihre Komponenten unter src/modules/<name>/ ablegen.
export const modules = [
  { id: 'dashboard', title: 'Dashboard', description: 'Dein Überblick über den Kita-Alltag.' },
  { id: 'kita', title: 'Kita', description: 'Hier entsteht der Bereich für deine Kita.' },
  { id: 'mitarbeiter', title: 'Mitarbeiter', description: 'Hier entsteht die Übersicht für dein Team.' },
  { id: 'abwesenheiten', title: 'Abwesenheiten', description: 'Urlaub, Krankheit und weitere Abwesenheiten deines Teams.' },
  { id: 'termine', title: 'Sondertermine', description: 'Einmalige und wiederkehrende Termine für dein Team.' },
  { id: 'dienstplan', title: 'Dienstplan', description: 'Schichten, Abwesenheiten und Sondertermine im Wochenüberblick.' },
  { id: 'vorlagen', title: 'Vorlagen', description: 'Gerätelokale Wochenmuster speichern und sicher anwenden.' },
  { id: 'monatsplan', title: 'Monatsübersicht', description: 'Monatliche Besetzung und geplante Netto-Arbeitszeiten.' },
  { id: 'einstellungen', title: 'Einstellungen', description: 'Deine lokalen App-Daten verwalten.' },
] as const
