# P10 – Demo-Kita und Wochenansicht

**Einstellungen → Datenverwaltung → Demo-Kita laden → DEMO ausdrücklich lokal laden.** Die Vorschau nennt die aktuelle Kalenderwoche. Anschließend öffnet sich der Dienstplan. Keine automatische Speicherung beim App-Start und keine Cloud-Übertragung.

Nur ein leerer lokaler Bestand ist zulässig. Jeder belegte fachliche Key, auch beschädigte Daten oder leere gespeicherte Listen, sperrt das Laden. Ein vom leeren Einrichtungsassistenten automatisch angelegter Entwurf ohne jede Antwort (gegebenenfalls pausiert) zählt als uninitialisiert. Beantwortete/geänderte Entwürfe werden nicht überschrieben. Aktiver/beschädigter Cloud-Zeiger sperrt die Demo. Auth-Daten, fremde Keys und inaktive Cloud-Caches bleiben erhalten. Keine neuen Storage-Keys, Datenbankänderungen oder Abhängigkeiten.

Die fiktive **DEMO · Kita Sonnengarten** umfasst:

| Gruppe | Mitarbeitende und vertragliche Wochenstunden |
|---|---|
| Nest (3) | Nora Nest 37,5 · Nils Nest 35 · Nele Nest 25 |
| Sonne (4) | Sofia Sonne 37,5 · Sami Sonne 32,5 · Sina Sonne 30 · Simon Sonne 20 |
| Sterne (4) | Stella Sterne 37,5 · Sven Sterne 35 · Selma Sterne 30 · Silas Sterne 24 |

Alle Namen tragen zusätzlich „DEMO“. Montag–Freitag 07:00–16:00, Frühbetreuung 07:00–08:00, Kernbetreuung 08:00–15:00, Spätbetreuung 15:00–16:00. Test-Sollwerte: Früh/Spät gemeinsam jeweils 3, pro Gruppe 1/2/1 für 08:00–09:00/09:00–14:00/14:00–15:00. Dies sind frei gewählte Beispiele, keine gesetzlichen Vorgaben.

53 ausdrücklich geladene Beispielschichten decken die vollständige Mo–Fr-Woche ab: wechselnde Früh-/Spätdienste, Teilzeit-Kernzeiten, explizite 0/15/30 Minuten Pause. 344 Vertragsstunden insgesamt; 333 geplante Netto-Stunden nach Auslassung der beiden ganztägig abwesenden Dienste. Abwesenheitszeit wird nicht als geleistete Schichtzeit erfunden. Nils hat dienstags Urlaub, Simon donnerstags Fortbildung; Sina ist mittwochs vormittags ohne konkrete Uhrzeit abwesend. Teamsitzung, Nest-Ausflug und ein Sonntags-Familiengottesdienst bieten Terminbeispiele.

**Keine Wochenendschichten**, keine regulären Öffnungszeiten am Wochenende und kein gesetzter Wochenendbedarf. Der Sonntagstermin macht das Wochenende sichtbar. Sonderschichten bleiben über die vorhandene Bearbeitung möglich. Ohne konkret festgelegten Sonderbedarf bleibt die Wochenendampel „Bedarf nicht festgelegt“. Pausen ohne Lage und der Halbtag bleiben „Prüfen“; die Demo darf deshalb nicht als durchgehend grün oder als freigegebener Musterplan verstanden werden. Veröffentlichungen werden nicht erfunden (Versionsliste zunächst leer). Vor einer Veröffentlichung gelten weiterhin alle bestehenden Prüfungen.

Der Plan bietet einen Stammgruppenfilter (nur Personenanzeige, alle Prüfungen bleiben für den gesamten Plan), gruppierte kompakte Tageskarten, direkte Tageswahl und per Tap/Klick bzw. Tastatur erreichbare Schichtkarten. Früh/Kern/Spät werden anhand der vorhandenen Kita-Zeiten als Text und Pastellfarbe angezeigt; eine Schicht kann mehrere Bereiche umfassen. Geschlossene Tage/Wochenenden werden als Sonderdienst gekennzeichnet. Desktop-Raster, Freigaben, Drucken, Berechnungen und Planungsalgorithmen bleiben erhalten.

Mit **Lokale App zurücksetzen (P9)** lässt sich die gesamte Demo nach Sicherung und Bestätigung entfernen. Bei einem Laden-/Speicherfehler erfolgt kein Erfolgshinweis; bereits geschriebene Werte werden soweit möglich zurückgenommen, ohne zwischenzeitliche Änderungen zu überschreiben. Bei blockierter Wiederherstellung bitte Datenverwaltung prüfen und nicht von einem vollständigen Demo-Import ausgehen.

Gezielte Tests prüfen Datenmodelle, 3/4/4-Gruppen, 11 Namen, Schichten/Nettozeiten, Abwesenheiten, Sonntag, ISO-Jahreswechsel, Cloud-/Bestandsschutz, Rollback, P9-Reset, Dienstkennzeichnungen und gerenderte Tageskarten. Zusätzlich bestehende Schicht- und Freigabe-/Drucktests sowie TypeScript/Build. Browser-Sandbox nicht erneut gestartet. Manuell auf iPhone prüfen: 11 Karten, Gruppenfilter, Tageswechsel einschließlich Sonntag, Bearbeiten per Tap, Zeiteingaben, keine horizontalen Seitenüberläufe; am Desktop Raster/Sticky-Überschriften und Druck prüfen.
