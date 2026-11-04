# P13 – wiederverwendbare Wochenvorlagen

Im Wochenplan **Vorlagen** verwenden; direkt auch über die Desktop-Navigation bzw. auf iPhone **Mehr → Vorlagen** (`#vorlagen`). Der Link öffnet den vorhandenen Wochenplan und fokussiert den Vorlagenbereich. Offene Schichtbearbeitung/Generatorvorschau wird dabei nicht verworfen.

## Bedienung

1. Gewünschte Woche im Arbeitsplan öffnen. Unter „Aktuelle Woche als Vorlage speichern“ einen Namen eingeben und **Vorlage speichern** wählen. Alle gespeicherten Schichten aller Gruppen zählen, unabhängig vom Ansichtsfilter. Eine leere oder ungültige/überschneidende Quellwoche wird nicht als Muster gespeichert.
2. Gespeicherte Vorlagen werden mit Schicht-/Wochenendanzahl aufgelistet und bleiben nach Neuladen verfügbar. „Umbenennen“ ändert nur den Namen. „Löschen“ verlangt eine separate Sicherheitsbestätigung und ändert keinen Arbeitsplan.
3. „Anwenden“ wählen, ein Datum in der Zielwoche einstellen und **Vorlagenvorschau prüfen**. Anzahl übertragbarer/übersprungener Schichten, konkrete Gründe und Prüfung des kombinierten Zielplans prüfen. Nur nach Checkbox-Bestätigung **Vorlage bestätigt anwenden** wählen. Anschließend öffnet sich die Zielwoche.

Die Vorlage enthält ausschließlich Mitarbeiter-/Gruppen-IDs, Wochentage (Montag 0 bis Sonntag 6), Beginn/Ende und optionale Pausenminuten. Keine konkreten Kalenderdaten, Quell-Schicht-IDs, Abwesenheiten, Termine, Regeln oder Veröffentlichungsstände werden gespeichert. Aktuelle Personen-/Gruppennamen und Regeln werden beim Anwenden aus dem Ziel-Arbeitsbestand gelesen. Fehlende Zuordnungen werden übersprungen, niemals anhand ähnlicher Namen ersetzt. Einmalige Wochenendtermine erzeugen keine Muster-Schichten. Tatsächlich gespeicherte Wochenendschichten werden als ausdrücklicher Teil des Musters gekennzeichnet und bleiben Sonderdienste ohne automatisch erfundenen Sollbedarf.

## P12 wiederverwenden

`preparePatternCopy` ergänzt lediglich einen undatierten Mustereingang im bestehenden P12-Kopierkern. Dieselben Prüfungen für Überschneidungen, Abwesenheiten/Halbtage, Sondertermine/Wiederholungen, Verfügbarkeiten, aktuelle konfigurierte Grenzen und feste geteilte Tagesdienste bleiben maßgeblich. Bestehende Zielschichten werden nicht überschrieben. Veröffentlichte Zielwochen sind gesperrt. Die gemeinsame Vorschau `WeekCopyPreview` wird von P12 und P13 verwendet.

Vor Anwendung werden die lokale Vorlage und der gesamte P12-Vorschau-/Arbeitsbereichs-/Freigabestand erneut geprüft. Eine geänderte Vorlage oder ein geänderter Plan verlangt eine neue Vorschau. `adoptWeekCopy` speichert alle akzeptierten Schichten in einem einzigen Schreibvorgang im unveränderten Schichtvertrag. Musterdaten/Pseudo-Quellschichten gelangen nicht in den Plan. Bei Speicherfehlern gibt es keine Teilübernahme. Bestehende Konflikte/offene Bedarfe des Zielplans werden wie in P12 angezeigt und nicht automatisch behoben; eine Anwendung ist keine Freigabe.

## Ausschließlich lokal

Neuer, klar getrennter Browser-Key **`caro:week-templates:v1`** mit versionierter Vorlagenliste. Unbekannte/beschädigte Versionen werden nicht überschrieben. Anlegen, Umbenennen und Löschen verwenden jeweils einen atomaren Schreibvorgang mit vorheriger Zustandsprüfung.

Vorlagen sind bewusst gerätelokal und unabhängig von der Cloud-Anmeldung zugänglich, wie andere lokale Browserdaten. Sie werden nicht in `AREAS`, Cloud-Payload, Supabase-Tabellen, P8c-Datenübernahme oder Cloud-Backup aufgenommen. **Keine Cloud-Synchronisierung der Vorlagen, keine Migration und keine neuen Abhängigkeiten.** Die Oberfläche kennzeichnet dies auch bei aktivem Cloud-Arbeitsbereich ausdrücklich. Dort angewendete Schichten ändern lediglich den normalen lokalen Cloud-Arbeitscache über den unveränderten Storage-Adapter; eine spätere manuelle Plansynchronisierung bleibt eine separate vorhandene Aktion.

Der bisherige P9-Planreset bleibt unverändert und lässt den separaten lokalen Vorlagenbereich erhalten; Vorlagen werden gezielt hier gelöscht. Nach entfernten/neuen Stammdaten können alte Zuordnungen fehlen und werden dann übersprungen. Es gibt keine automatische Umverknüpfung, Vorlagenmigration oder geräteübergreifende Übertragung.

## Prüfungen und manuelle Abnahme

Sieben neue gezielte Tests mit der 11-Personen-Demo: Speichern/Wiederladen und erlaubte undatierte Felder; Umbenennen/Löschbestätigung und veraltete Bearbeitung; P12-Vorschau/Ein-Write-Übernahme ohne Überschreiben; Abwesenheiten/Sondertermine/fehlende Personen und veröffentlichte Ziele; tatsächliche Wochenenddienste; ausschließlich lokale Vorlagen bei aktivem Cloud-Arbeitsbereich; unbekannte Formate, geänderte Vorschau/Vorlage/Plan sowie Speicherfehler. Dazu sieben P12-Regressionstests, vier Navigationstests, TypeScript und Produktionsbuild.

Browser wegen bekannter Sandbox-Blockade nicht erneut gestartet. Manuell auf iPhone prüfen: „Mehr → Vorlagen“, lokalen Hinweis bei aktivem Cloud-Arbeitsbereich, Namen speichern/umbenennen/löschen, Ziel-Datumswahl, lange Überspringen-/Prüflisten und bestätigte Anwendung. Nach Neuladen Persistenz und auf Desktop Tastatur-/Fokusführung prüfen. Keine produktiven Daten wurden hierfür gelesen oder verändert.
