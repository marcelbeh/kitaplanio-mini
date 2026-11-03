# KitaPlanio Lite

Eigenständige private PWA auf Basis von React, TypeScript und Vite. P1 liefert die responsive Grundoberfläche. P2 ergänzt im Bereich „Kita“ einen geführten Einrichtungsassistenten, P3 die Mitarbeiterverwaltung mit Arbeitsregeln. Die übrigen Bereiche bleiben Platzhalter. Keine Datenbank, Authentifizierung oder Planungslogik.

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

`build` prüft auch TypeScript und erzeugt `dist/`. Der Produktionsbuild ist für den GitHub-Pages-Unterpfad `/kitaplanio-mini/` konfiguriert. `dist/` entsprechend unter diesem Pfad über HTTPS ausliefern.

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

## Mitarbeiter & Arbeitsregeln (P3)

Im Bereich „Mitarbeiter“ lassen sich Mitarbeiter anlegen, bearbeiten und nach ausdrücklicher Bestätigung entfernen. Formularänderungen werden erst mit „Speichern bestätigen“ übernommen; „Abbrechen“ verwirft sie. Stammgruppen kommen ausschließlich aus der abgeschlossenen P2-Einrichtung und werden per Gruppen-ID referenziert. Umbenannte Gruppen erscheinen beim erneuten Öffnen mit ihrem aktuellen Namen. Ohne abgeschlossene Kita-Einrichtung ist keine Mitarbeiteranlage möglich; fehlende Gruppen löschen keine Mitarbeiterdaten.

Erfasst werden Name, Stammgruppe, frei eingegebene Qualifikation, vertragliche Wochenstunden, reguläre Arbeitstage (Mo–Fr), ein möglicher Arbeitsrahmen, optionale verbindliche Tageszeiten sowie zusätzliche Muss-/Wunsch-Regeln mit optionalem Wochentag. Stunden können mit Komma oder Punkt eingegeben werden; gespeichert werden ganze Vertragsminuten, ohne stilles Runden. Freie Regeltexte werden nicht interpretiert.

Plausibilitätsprüfung: Pflichtfelder, gültige Gruppenreferenz, positive Vertragsstunden, mindestens ein regulärer Arbeitstag, gültige Zeitfenster, feste Zeiten innerhalb des Arbeitsrahmens und nur an regulären Tagen. Die Wochenstunden dürfen die verfügbare Bruttozeit nicht überschreiten. Die exakte Planbarkeit nach Pausen wird noch nicht berechnet: Gesetzliche Pausen sollen später automatisch eingeplant werden und zählen nicht zur Arbeitszeit. Vertragliche Wochenstunden sind später exakt einzuhalten; Urlaub, Krankheit und Feiertage werden mit den jeweils geltenden Sollstunden ohne Nacharbeit berücksichtigt. P3 berechnet noch keine Tages-Sollstunden.

Speicherung: eigener Schlüssel `kitaplanio-lite:employees:v1`, Datenversion `1`, stabile Mitarbeiter- und Regel-IDs. P2-Kitadaten werden ausschließlich gelesen. Beschädigte oder unbekannte Mitarbeiterdaten werden nicht überschrieben. Keine Datenbank, Anmeldung oder Synchronisierung.

Gezielte P3-Prüfungen mit den vorhandenen Werkzeugen:

```sh
node --experimental-strip-types --test tests/employees.test.mjs
```

Geprüft werden CRUD, Validierung, Gruppenreferenzen, versionierte Speicherung, Speicherfehler, unveränderte P2-Daten und serverseitig gerenderte Karten/Formularfelder. Interaktive Bestätigungen, Abbrechen und die iPhone-Darstellung bleiben manuell im Browser zu prüfen; Renderprüfungen ersetzen dies nicht.

## Premium-Oberfläche (P3.5)

Branding nach dem „KitaPlanio Lite Branding- und Designkonzept“, Version 1.0: Aubergine, Creme, Flieder, Apricot und Mint; eigenständige SVG-Giraffe, helle/dunkle Wortmarke und abgeleitete PWA-Icons. Zentrale Designvariablen liegen in `src/app/styles.css`. Desktop nutzt eine feste Seitenleiste, Smartphone eine untere Navigation mit Start, Plan, Team und Mehr.

Auf ausdrücklichen Wunsch werden ausschließlich vorhandene Systemschriften genutzt: `Avenir Next`/`Trebuchet MS` bzw. System-Sans für Daten und Formulare, `Bradley Hand`/`Segoe Print` bzw. eine lokale Schreibschrift für „Lite“. Die Darstellung kann je nach Gerät abweichen. Keine Schrift-Downloads, externen Bilddienste, KI-Bilder oder neuen Abhängigkeiten.

Das Dashboard liest vorhandene Kita-/Mitarbeiterdaten ohne Schreibzugriff und zeigt den Einrichtungsstatus. Begrüßung und Datum richten sich nach der lokalen Gerätezeit. Gruppen werden erst nach abgeschlossener Einrichtung gezählt. Nicht verfügbare Daten werden als solche gekennzeichnet; Wochenplanung, Besetzung und Konflikte bleiben ausdrücklich Vorschau. Es gibt keine erfundenen Besetzungsquoten. Speicherformate und P2/P3-Geschäftslogik bleiben unverändert.

Zusätzlicher gezielter Rendercheck:

```sh
node --experimental-strip-types --test tests/premium-ui.test.mjs
```

Der Check prüft Dashboard-Daten, Speicherfehler, ausbleibende Schreibzugriffe, Vorschaukennzeichnung und vorhandene Navigationsziele. Der Browserlauf wurde durch `listen EPERM 127.0.0.1:4173` vor dem Browserstart blockiert. Deshalb keine echten Desktop-/Smartphone-Screenshots; mobile Mehr-Navigation, Umbruch, Fokus und visuelle Darstellung sind manuell nachzuprüfen. Keine wiederholten Browser- oder Installationsversuche.

## Geführtes Einrichtungsinterview (P3.6b)

Der vorhandene Kita-Assistent führt jetzt durch Kita/Gruppen, Öffnungszeiten, Personalbedarf, Team, Arbeitsregeln und Abschluss. Personalbedarf wird jeweils für einen Betreuungsbereich und Teamangaben jeweils für eine Person bearbeitet. Das vorhandene Mitarbeiterformular wird für Stammdaten und Arbeitsregeln wiederverwendet.

Neu sind optionale Kita-Namen und Pausenhinweise sowie ausgewählte Betreuungstage Mo–Fr mit einheitlichen Zeiten. Alte Datensätze ohne diese optionalen Felder bleiben gültig; die bisherigen Mo–Fr-Zeiten gelten unverändert. Bereits abgeschlossene Einrichtungen behalten die Gruppensperre. Neue Personalbedarfe und Regeln werden nicht vorausgefüllt. Pausenhinweise sind Freitext; keine rechtlichen Werte, Auswertung oder Berechnung. Wochenendbetreuung und unterschiedliche tägliche Öffnungszeiten sind nicht enthalten.

Interviewantworten liegen separat unter `kitaplanio-lite:interview:v1` (Version 1), einschließlich Schritt, Roh-Stundenangabe, ausgewählter Person und Pausenstatus. Antworten werden automatisch zwischengespeichert, ohne gültige Stammdaten zu verändern. „Später fortsetzen“ führt zum Dashboard; dort ist ein Fortsetzen möglich. Neue, noch nicht eingerichtete Installationen öffnen das Interview beim Start ohne Bereichslink automatisch. Bestehende abgeschlossene Einrichtungen werden nicht ungefragt umgeleitet.

Erst der bestätigte Abschluss übernimmt gültige Angaben mit den vorhandenen Speicherfunktionen. Seit Beginn anderweitig geänderte Stammdaten werden erkannt und nicht überschrieben. Auf ausdrückliche Bestätigung lassen sich aktuelle Stammdaten neu einlesen (verwirft die Interviewantworten). Unveränderte bestehende Datensätze bleiben bytegenau erhalten. Bei fehlgeschlagenen Schreibvorgängen wird die vorherige Belegung wiederhergestellt; Browser-Speicherung ersetzt keine transaktionale Datenbank. Ein Abschlussmarker verhindert einen automatischen Neustart. Teamdaten bleiben direkt bearbeitbar; Kita-Angaben können über den bestehenden Assistenten bearbeitet werden.

Nach Abschluss erscheint das Dashboard mit „Ersten Dienstplan erstellen“. Dieser Link öffnet weiterhin ausschließlich die vorhandene Dienstplan-Vorschau; es gibt keine neue Planungsautomatik.

Gezielte Durchlauf-, Unterbrechungs-, Wiederaufnahme-, Abschluss- und Datenerhaltprüfungen:

```sh
node --experimental-strip-types --test tests/interview.test.mjs
```

Diese prüfen den gespeicherten Ablauf und die Formularaufteilung ohne Browserlayout. Die bekannte Browser-/iPhone-Prüflücke bleibt bestehen; es wurden keine zusätzlichen Browserinstallationen oder erneuten EPERM-Versuche durchgeführt.

## GitHub Pages

`.github/workflows/pages.yml` baut nach Änderungen an `main` mit Node.js 24, `npm ci` und `npm run build` und veröffentlicht `dist/` über das Environment `github-pages`. Ein manueller Start ist ebenfalls möglich; veröffentlicht wird ausschließlich aus `main`. GitHub Pages muss unter Settings → Pages → Source auf GitHub Actions stehen (bei der Einrichtung bereits so vorgefunden). Es sind keine zusätzlichen Secrets oder Pakete nötig.

Vite-Basis, Manifest-ID, Start-URL, Scope, PWA-Icons, Service-Worker-Registrierung und Navigation-Fallback verwenden `/kitaplanio-mini/`. Logos und Maskottchen werden relativ zum Dokument geladen. Die vorhandene Hash-Navigation benötigt keine serverseitigen Routenumleitungen. Lokale Entwicklung/Vorschau ebenfalls unter `/kitaplanio-mini/` öffnen.

Nach dem Merge startet das erste Produktionsdeployment. Erst wenn der Deploy-Job erfolgreich ist, die von `actions/deploy-pages` ausgegebene `page_url` im Environment öffnen und die tatsächliche Live-Adresse bestätigen. Vorher besteht keine bestätigte Veröffentlichung. Nach Veröffentlichung im Browser Hash-Navigation, Assets, Manifest, Installation und Offline-Neuladen prüfen. Der lokale Browserlauf bleibt durch die bereits dokumentierte EPERM-Beschränkung ungeprüft; der Produktionsbuild wurde statisch auf korrekte Unterpfade und vollständig vorhandene PWA-Assets geprüft.

## Abwesenheiten (P4a)

Der Bereich „Abwesenheiten“ erfasst Urlaub, Krankheit, Fortbildung, Freizeitausgleich und sonstige Abwesenheiten für vorhandene Mitarbeiter. Start- und Enddatum zählen einschließlich. Ganztägige Einträge können mehrere Kalendertage umfassen; halbtägige Einträge gelten für ein Datum, wahlweise Vormittag oder Nachmittag. Halbtage legen keine Uhrzeiten oder pauschalen Arbeitsstunden fest.

Die Übersicht ist chronologisch sortiert und nach Mitarbeiter sowie Zeitraum filterbar; ein Filter findet auch Einträge, die den Zeitraum nur teilweise überschneiden. Änderungen werden ausdrücklich gespeichert oder abgebrochen. Löschen benötigt eine zweite Bestätigung. Überschneidungen derselben Person werden angezeigt und beim Speichern verhindert; Vormittag und Nachmittag desselben Tages sind kombinierbar. Die eigene ID wird bei der Bearbeitung nicht als Konflikt gezählt.

Mitarbeiterkarten zeigen ihre Abwesenheiten aufklappbar an. Der neue Speicherbereich `kitaplanio-lite:absences:v1` verwendet Version 1, stabile Eintrags- und Mitarbeiter-IDs, ISO-Kalenderdaten und einen Ganztags-/Halbtagswert. Ein Namenssnapshot erhält die Zuordnung historischer Einträge nach Entfernung eines Mitarbeiters; bestehende Abwesenheiten werden dabei nicht gelöscht und bleiben bearbeitbar. Aktuelle Namen haben in der Anzeige Vorrang.

Kita-, Interview- und Mitarbeiterdaten werden von der Abwesenheitsverwaltung ausschließlich gelesen. Unbekannte/beschädigte Abwesenheitsdaten werden nicht überschrieben; Speicherfehler verhindern Erfolgsmeldungen. Keine Supabase-Anbindung, Synchronisierung, Urlaubs-/Sollstundenberechnung, Feiertagsbereinigung oder Dienstplanerzeugung. Das Modell ermöglicht eine spätere Berücksichtigung von Abwesenheiten durch die Planung.

Gezielte Prüfungen mit vorhandenen Werkzeugen:

```sh
node --experimental-strip-types --test tests/absences.test.mjs
```

Mac-/iPhone-Bedienung einschließlich Formular, Filter und Löschbestätigung vor Freigabe manuell prüfen. Änderungen erscheinen unter der bestehenden GitHub-Pages-Adresse erst nach Merge und erfolgreichem Deployment.
