# caro. · Finaler Release-Audit

Stand: 05.11.2026. Grundlage: main `443e30c367d08a6530eaf46c09ac4567773de414`; PR #31 ist gemergt. Der [P18-Bericht](p18-quality-report.md) bleibt die Grundlage für bereits bestandene Fachprüfungen. Dieser Folgeaudit untersucht nur dessen offene/eingeschränkte Punkte und neu reproduzierte Risiken. Alle Daten sind fiktiv, Speicher und Remote-Schnittstellen werden simuliert. Keine produktiven Daten-/Cloud-Zugriffe, SQL-Änderungen, neuen App-Abhängigkeiten, Datenformate, Features, KI oder Design-Neuentwicklung.

## Eindeutiges Urteil: **nicht freigabefähig**

Für den produktiven Alltag fehlen zwingende Nachweise: vollständige Wiederherstellung einschließlich gerätelokaler Vorlagen, echte Auth-/RLS-/Zwei-Geräte-Abnahme und tatsächlicher Ein-Seiten-PDF-Druck. Lokale Tests ersetzen diese Nachweise nicht. Die unten behobenen Datenverlustfälle verbessern den Bestandsschutz, schließen aber keine globale Transaktion über mehrere Tabs ein.

## Nachgewiesene Fehler und minimale Korrekturen

### P0 · Parallel ergänzte Einträge konnten verloren gehen

P18 schützte den bearbeiteten Originaleintrag. Zwischen Einlesen und Speichern konnte jedoch ein **anderer** Eintrag derselben Sammlung hinzukommen. Weil der Originaleintrag unverändert blieb, bestanden die bisherigen Prüfungen; das Schreiben der alten Gesamtliste löschte die parallele Ergänzung. Dies betrifft Mitarbeitende, Abwesenheiten, Sondertermine und Schichten – jeweils auch das Löschen eines anderen Eintrags.

Reproduktion: Vier neue Tests lassen einen zweiten fiktiven Schreiber direkt nach dem Lesen einen Eintrag ergänzen. Am unveränderten main schlugen alle vier Tests fehl. Nach Korrektur prüfen die vorhandenen Writer unmittelbar vor dem einzigen Schreibvorgang erneut die eingelesene Sammlung. Bei Abweichung wird ohne eigenen Schreibzugriff abgebrochen. Die parallele Ergänzung bleibt bytegenau erhalten. Die bestehenden Originaleintrag-Prüfungen und Speicherformate bleiben unverändert. Kein automatischer Merge, keine Sperrarchitektur.

**Grenze:** Lesen/Vergleichen/Schreiben sind weiterhin keine atomare browserweite CAS-Operation. Ein zeitlich noch engerer Parallelzugriff nach der letzten Prüfung kann ohne gemeinsame Transaktion nicht ausgeschlossen werden. Diese strukturelle Restgrenze ist keine Behauptung eines zusätzlich im realen Browser beobachteten Datenverlustes. Keine Freigabe für parallele Bearbeitung desselben Bestands in mehreren Tabs.

### P1 · Drucklayout überschritt bereits rechnerisch die Referenzhöhe

Die bisherige A4-Querformat-Tabelle gab bei nur einer Schicht sowohl deren Nettozeit als auch dieselbe Tagessumme nochmals aus – sogar 00:00 an leeren Tagen. Mit den bisherigen Schrift-/Zeilenhöhen und Zellabständen benötigen elf normale Mitarbeiterzeilen bereits mindestens rund **622 pt**, während nach 10-mm-Rändern nur rund **539 pt** Seitenhöhe verfügbar sind; Kopf/Fuß sind dabei noch nicht enthalten. Das ist ein nachgewiesenes statisches Layoutproblem, **kein beobachteter PDF-Seitenbefund**.

Korrektur ausschließlich an der vorhandenen Ausgabe: redundante Tagessumme bei null/einer Schicht entfällt; bei geteilten Diensten bleibt sie erhalten. Zeiten, Namen, Gruppen, Pausen, Wochenwerte, Version und Quelle bleiben sichtbar. Print-CSS reduziert Abstände und Schriftgrößen maßvoll. Der statische 11-Personen-Referenzfall hat nun ein ausreichendes Höhenbudget. Es gibt kein Abschneiden, versteckte Dienste oder erzwungene Ein-Seiten-Höhe. Große/lang beschriftete Pläne dürfen weiterhin natürlich umbrechen, statt Informationen zu verlieren.

**Die verbindliche Anforderung „eine Woche auf einer Seite“ ist damit noch nicht tatsächlich abgenommen.** Der 11-Personen-Referenzplan muss im echten PDF einschließlich Vollständigkeit und Lesbarkeit bestätigt werden, ebenso Wochenend-/Teil-/Langtextfälle. Für beliebig viele Personen und Dienste wird keine physikalisch unbegrenzte Ein-Seiten-Garantie behauptet.

## Nachgewiesene Grenzen ohne neue Features

### P0 · Backup und Wiederherstellung

Zwei neue Tests erzeugen einen echten JSON-Roundtrip im **isolierten Prüfspeicher** mit der vorhandenen Demo und zwei veröffentlichten Versionen:

- Die sieben im Reset-Backup enthaltenen Bereiche lassen sich nach simuliertem Reset aus ihren unveränderten Rohwerten wieder aufbauen; alle Modellprüfungen und beide Freigabeversionen bleiben erhalten.
- Lokale Vorlagen bleiben beim Reset erhalten, fehlen aber sowohl im Reset- als auch im P8c-Backup. Auf einem frischen Prüfspeicher fehlen diese Vorlagen nach Wiederaufbau der sieben Bereiche tatsächlich.
- Eine Reset-Datei wird vom P8c-Leser zu Recht nicht als dessen Erstübernahme-Datei akzeptiert. Es existiert weiterhin **kein allgemeiner In-App-Wiederherstellungsdialog**.

Dies ist ein Nachweis über Inhalt/Lesbarkeit der Dateien, **kein durchgeführter Browserdownload oder bedienbarer Restore auf einem Gerät**. Es wird keine Wiederherstellung als neue App-Funktion ergänzt und kein Backup-Format erweitert. Vor produktivem Einsatz ist ein vollständiger, praktisch erprobter Sicherungs-/Wiederherstellungsweg einschließlich Vorlagen und benötigter Cloud-Zwischenstände erforderlich. Ohne diesen Nachweis: Release-Blocker.

### P0 · Supabase und Zwei-Geräte-Betrieb

P18s gemockte Auth-, Eigentümer-, CAS-, Konflikt-, Offline-, Logout-, Arbeitsbereich- und Freigabeschutzprüfungen bleiben gültig; deren unveränderte Logik wird nicht neu entwickelt. Die vollständige Abschluss-Suite umfasst sie erneut. Reale Policies, installierte RPCs, Mitgliedschaftsentzug, Gerät A/B, Reconnect und verlorene Netzwerkantworten wurden nicht gegen ein produktives Projekt ausprobiert. Es gibt keinen produktiven Backend-Nachweis und keine Aussage über aktuell installierte Berechtigungen. Das ist eine fehlende Abnahme, kein neu nachgewiesener Serverfehler.

### P1 · Browser, Fokus, Touch und PDF technisch blockiert

Ein einzelner isolierter Chromium-Versuch endete vor dem Öffnen einer App-Seite mit `TargetClosedError`. Das Protokoll nennt `setsockopt: Operation not permitted (1)` und `SIGTRAP`. Kein App-Server wurde gestartet, keine Nutzerdaten geöffnet und kein PDF erzeugt. Weitere Browserstarts wurden ausdrücklich unterlassen. Der unterbrochene Versuch, einen zusätzlichen PDF-Prüfer zu installieren, wurde nicht ausgeführt; kein Tool/Prozess lief beim Wiederaufnehmen weiter. Keine zusätzliche App- oder Testbibliothek wurde installiert.

Safari/Mac, iPhone/WebKit, echtes Tab-/Escape-/Fokus-/Scrollverhalten, Touch/Überlauf, Browserdownload und tatsächliche PDF-Seitenzahl bleiben **offen**. Die vorhandenen Komponenten-/P17-Navigationstests sind kein Ersatz für Layout-/Gerätetests.

### P1 · PWA-Updates und offene Formulare

Quellbefund: `autoUpdate` aktiviert beim vorhandenen Plugin `skipWaiting` und `clientsClaim`. Das generierte `registerSW.js` registriert den Worker; es enthält keinen eigenen Seiten-Reload-Handler. Ein erzwungener Formularverlust durch einen solchen Handler wurde deshalb **nicht** als Fehler behauptet und kein neues Update-Feature eingebaut. Offen bleiben realer Worker-Wechsel, Cache-Bereinigung, Offline-Neustart und Verhalten offener Formulare bei Update/Prozessbeendigung. Ungespeicherte Formularzustände sind keine dauerhafte Sicherung.

## Abschlussprüfungen

| Prüfung | Ergebnis / Aussage |
| --- | --- |
| Vier neue Paralleländerungs-Regressionen | Vorher fehlgeschlagen, nach Korrektur bestanden; je Speichern und Löschen, fremde Ergänzung erhalten. |
| Zwei neue Sicherungsprüfungen | Bestanden; sieben Bereiche samt zwei Freigaben rekonstruierbar, Vorlagenlücke bestätigt. Kein allgemeiner Restore. |
| Zwei neue Druckregressionen | Bestanden; statisches Höhenbudget, Wegfall redundanter Einzel-Tagessummen, Erhalt von Teildiensten und Informationsinhalt. Kein echter PDF-Nachweis. |
| Gesamte Testsuite | **Bestanden:** `npm test`, alle 25 Testdateien erfolgreich; umfasst die vorhandene P18-Abdeckung. |
| TypeScript / Produktion | **Bestanden:** `npm run typecheck`, `npm run build` und `git diff --check`. |
| Browser/PDF/Live-Cloud | Nicht ausführbar bzw. durch Aufgabenrahmen ausgeschlossen; ausdrücklich offen. Keine erfolgreichen End-to-End-Tests behauptet. |

## Verbindliche manuelle Release-Gates

1. **Wiederherstellung:** Mit fiktivem Bestand vollständige Sicherung außerhalb des Browsers herstellen, auf leerem Testgerät wiederherstellen und alle sieben Bereiche, lokale Vorlagen, beide Freigaben und benötigte Offline-Zwischenstände vergleichen. Erst danach dürfen Reset/Browserbereinigung mit echten Daten erwogen werden. Ein Download allein reicht nicht.
2. **Cloud:** Separat freigegebenes Testprojekt/-konto mit fiktiven Daten: eigene/fremde/deaktivierte Mitgliedschaft, Auth/RLS-Negativfälle, CAS bei zwei Geräten, konkurrierende Änderungen, Abbrechen/Lokal/Cloud-Entscheidung, Offline→Online ohne automatische Übertragung, unbekannte Antwort und Arbeitsbereichwechsel. Keine produktiven Tests im Rahmen dieses PR.
3. **PDF:** Referenzwoche mit elf Mitarbeitenden, drei Gruppen und vollständigen Mo–Fr-Diensten in Safari auf **einer A4-Querformatseite** bei lesbarer Schrift ausgeben. Tatsächliche PDF-Seitenzahl prüfen und alle Personen, Dienste, Gruppen, Pausen, Tages-/Wochensummen, KW, Version und Datum gegen die Quelle vergleichen. Zusätzlich geteilte Dienste, lange Bezeichnungen und Samstag/Sonntag; keine abgeschnittenen Inhalte, Abwesenheitsgründe, internen Konfliktdetails oder Bedienelemente. Bei mehreren Seiten im verbindlichen Referenzfall keine Freigabe.
4. **Oberfläche:** Mac/Safari und iPhone: P17-Konfliktsprünge bei Gruppenfilter, mehrdeutigen/gesperrten Diensten, Datum/Zeiten/Pausen, Tastatur und sichtbarer Fokus, Touch-Flächen und keine horizontale Seitenüberläufe.
5. **PWA:** Installation/Offline-Start, Update bei geöffnetem ungespeichertem Formular und altem Tab, anschließend Kontrolllesen des gespeicherten Standes. Vor Updates Formulare bewusst speichern; alte Tabs kontrolliert schließen. Nicht parallel denselben Bestand bearbeiten.

Eine Freigabebewertung darf erst nach Nachweisen für diese Gates geändert werden. Kein Merge/Deployment durch diesen Audit. Testadresse erst nach späterem Merge und erfolgreichem Deployment: https://marcelbeh.github.io/kitaplanio-mini/ .
