# Lokale App zurücksetzen (P9)

Unter **Einstellungen → Datenverwaltung → Lokale App zurücksetzen**:

1. Offene Formulare vorher speichern. Bei aktivem Cloud-Arbeitsbereich ist der Reset gesperrt. Zuerst im bestehenden Cloud-Menü „Zu bisherigen lokalen Daten“ wählen und bestätigen; der Reset trennt nicht automatisch.
2. Vollständiges JSON-Backup herunterladen und privat aufbewahren. Die gespeicherte Datei erneut auswählen; ein Download-Klick allein gilt nicht als Sicherungsnachweis.
3. `LOKAL ZURÜCKSETZEN` eingeben und „Lokale Daten endgültig zurücksetzen“ wählen. Danach öffnet der leere Einrichtungsassistent. „Abbrechen“ ändert nichts.

Die versionierte Sicherung enthält die vollständigen **Rohwerte** (auch beschädigtes JSON bzw. `null`) aller sieben betroffenen Keys:

- `kitaplanio-lite:kita:v1` – Kita, Gruppen und Planungsgrenzen
- `kitaplanio-lite:interview:v1` – Einrichtungs-Zwischenstand samt eingebetteten Antworten
- `kitaplanio-lite:employees:v1` – Mitarbeitende, Regeln, Wünsche und Verfügbarkeiten
- `kitaplanio-lite:shifts:v1` – Dienstplan, Schichten und Pausen
- `kitaplanio-lite:absences:v1` – Abwesenheiten
- `kitaplanio-lite:events:v1` – Sondertermine
- `caro:published-weeks:v1` – lokale veröffentlichte Wochenversionen

Keine Präfix-Löschung und kein `localStorage.clear()`. Auth-Zugangsdaten (`caro:auth:v1` samt SDK-Nebenkeys), andere Browserdaten und **inaktive lokale Cloud-Caches** (`caro:sync-workspace:v1:<UUID>`, inklusive Offline-Änderungen/Sicherungen) bleiben ausdrücklich erhalten. Diese Cloud-Caches sind nicht Ziel des Resets und deshalb nicht Teil der Reset-Sicherung. Sie können später nur durch ausdrücklich bestätigtes Öffnen wieder sichtbar werden. Kein Supabase-Aufruf, keine Synchronisierung, keine SQL-/RLS-/Cloud-Logikänderung.

Der Cloud-Zeiger `caro:sync-active:v1` muss vor Beginn und während des Resets fehlen. Auch ein beschädigter/leerer vorhandener Zeiger sperrt sicher. Bei geänderten Daten seit der Sicherung wird abgebrochen. Bei Löschfehlern versucht die Funktion, bereits entfernte Originalwerte wiederherzustellen, ohne parallele neue Werte zu überschreiben. Falls der Browser auch die Wiederherstellung blockiert, wird ausdrücklich ein unvollständiger Reset gemeldet: nicht weiterbearbeiten und die unveränderte heruntergeladene Rohdaten-Sicherung zur manuellen Wiederherstellung aufbewahren. Es gibt keine automatische Löschung von Sicherungsdateien und keinen zusätzlichen Wiederherstellungsassistenten.

Prüfungen: sechs gezielte Reset-Tests (Keys, Bestätigung/Backup, Auth/Cloud-Schutz, veralteter Stand, Fehler/Rollback und paralleler Cloud-Wechsel), zwei bestehende Navigationstests, TypeScript und Produktionsbuild. Safari-Dateidownload, tatsächlicher Datei-Picker und mobile Darstellung bleiben wegen bekannter Browser-Sandbox-Blockade manuell zu prüfen; keine wiederholten Browserstarts.
