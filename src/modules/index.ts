// Neue Module hier registrieren und ihre Komponenten unter src/modules/<name>/ ablegen.
export const modules = [
  { id: 'dashboard', title: 'Dashboard', description: 'Dein Überblick über den Kita-Alltag.' },
  { id: 'kita', title: 'Kita', description: 'Hier entsteht der Bereich für deine Kita.' },
  { id: 'mitarbeiter', title: 'Mitarbeiter', description: 'Hier entsteht die Übersicht für dein Team.' },
  { id: 'abwesenheiten', title: 'Abwesenheiten', description: 'Hier entsteht der Bereich für Abwesenheiten.' },
  { id: 'dienstplan', title: 'Dienstplan', description: 'Hier entsteht die Übersicht für den Dienstplan.' },
  { id: 'einstellungen', title: 'Einstellungen', description: 'Hier entsteht der Bereich für deine Einstellungen.' },
] as const
