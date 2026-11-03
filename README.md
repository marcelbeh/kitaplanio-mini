# KitaPlanio Lite

Eigenständige private PWA auf Basis von React, TypeScript und Vite. P1 liefert die responsive Grundoberfläche. P2 ergänzt im Bereich „Kita“ einen geführten Einrichtungsassistenten; die anderen Bereiche bleiben Platzhalter. Keine Datenbank, Authentifizierung oder Planungslogik.

## Lokal starten

Voraussetzung: Node.js ab 22.12 und npm.

```sh
npm ci
npm run dev
```

## Prüfen und bauen

```sh
npm run typecheck
npm run build
npm run preview
```

`build` prüft auch TypeScript und erzeugt `dist/`. Zum Bereitstellen den Inhalt von `dist/` unter der Domainwurzel über HTTPS ausliefern.

## PWA und Offline

Manifest und Service Worker werden beim Produktionsbuild mit `vite-plugin-pwa` erzeugt. Nach dem ersten vollständigen Online-Aufruf und der Service-Worker-Aktivierung ist die Grundoberfläche mit allen sechs Bereichen offline verfügbar. Im Entwicklungsmodus ist der Service Worker deaktiviert.

Gezielter Check: Produktionsvorschau auf `localhost` öffnen, Service-Worker-Aktivierung abwarten, Browser auf offline stellen und neu laden. Alle Navigationsbereiche müssen weiter funktionieren. Manifest, Icons und Offline-Cache lassen sich in den Browser-Entwicklerwerkzeugen unter Application prüfen.

Installation benötigt HTTPS (lokal genügt localhost). Auf dem iPhone in Safari über Teilen → Zum Home-Bildschirm installieren. Die private GitHub-Sichtbarkeit ersetzt keinen Zugriffsschutz für eine spätere Bereitstellung.

## Struktur

- `src/app/`: App-Rahmen, Navigation und globale Styles
- `src/modules/`: Bereichsdefinitionen; spätere Module in eigenen Unterordnern
- `src/shared/components/`: gemeinsame Komponenten
- `public/`: lokale Icons und statische Dateien
- `vite.config.ts`: Build, Manifest und Offline-Caching

Hash-Navigation hält Direktlinks und Browser-Zurück ohne zusätzliche Router-Abhängigkeit verfügbar. Alle Schriften und Assets werden lokal geladen. Andere Repositories werden nicht eingebunden.

## Kita-Einrichtung (P2)

Vier Schritte führen durch Gruppen, einheitliche Öffnungszeiten (Montag–Freitag), Mindestbesetzung und Abschluss. Die Gruppenanzahl (1–100) wird beim Abschluss gesperrt; Namen, Zeiten und Mindestwerte bleiben bearbeitbar. Bearbeitungen werden erst mit „Änderungen speichern“ übernommen.

Die Betreuung deckt die Öffnungszeiten lückenlos ab: gemeinsame Frühbetreuung → Kernbetreuung je Gruppe → gemeinsame Spätbetreuung. Jeder Bereich hat positive Zeitfenster und ganzzahlige Mindestwerte ab 1. Gruppen können ihre Kernzeit in mehrere angrenzende Abschnitte mit verschiedenen Mindestwerten aufteilen.

Speicherung: `localStorage`, Schlüssel `kitaplanio-lite:kita:v1`, Datenversion `1`, feste Gruppen-IDs und Abschlussstatus. Entwürfe werden beim Weitergehen gespeichert; abgeschlossene Einstellungen bleiben während einer Bearbeitung erhalten. Browserdaten zu löschen entfernt auch die Einrichtung. Keine Anmeldung, Datenbank oder Synchronisierung. Unbekannte/beschädigte Daten werden nicht still überschrieben.

Gezielte Prüfungen ohne zusätzliche Pakete (Node.js 22.12+):

```sh
node --experimental-strip-types --test tests/kita-setup.test.mjs
```

Der Check prüft Validierung, Gruppensperre, Speicherfehler und Wiederherstellung einschließlich der serverseitig gerenderten Abschlussansicht. Er ersetzt keinen Browser- oder iPhone-Test. Für einen manuellen Check: `npm run preview`, Einrichtung unter „Kita“ durchlaufen, neu laden, zulässige Einstellungen bearbeiten und die Ansicht bei 390 px Breite prüfen.
