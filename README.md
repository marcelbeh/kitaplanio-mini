# KitaPlanio Lite

Eigenständige private PWA auf Basis von React, TypeScript und Vite. P1 enthält ausschließlich die responsive Grundoberfläche mit sechs Platzhalterbereichen. Keine Datenbank, Authentifizierung oder Planungslogik.

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
