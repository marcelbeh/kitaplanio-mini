# P11 – Monatsübersicht

Im bestehenden **Dienstplan** zwischen **Woche / Monat** wechseln. Die Monatsansicht bietet Zurück/Weiter, „Heute“ und eine Monatsauswahl. Stammgruppen stammen unverändert aus den Kita-Daten (in der Demo Nest/Sonne/Sterne). Tageskarten zeigen eindeutig gezählte geplante Personen, ganztägig oder teilweise abwesende Personen, den bestehenden Besetzungsstatus, Konflikt-/Hinweiszahlen und bis zu zwei Sondertermine mit einem Hinweis auf weitere Einträge.

Ein Tagesklick öffnet dieselbe Woche im vorhandenen Dienstplan und fokussiert auf dem iPhone den ausgewählten Tag bzw. am Desktop dessen Tagesüberschrift. Schichtbearbeitung, Generator, detaillierte Ampel-/Konfliktprüfung, Freigaben und Druck erfolgen dort weiter wie bisher. Bei offenem Schichtformular oder Generatorvorschlag ist der Ansichtswechsel gesperrt. Die Monatsübersicht zeigt den aktuellen Arbeitsplan, keine veröffentlichte Version.

## Filter und Berechnungen

Wie im P10-Wochenplan ist der Filter ein **Stammgruppenfilter**: Personen, ihre Abwesenheiten, passende Sondertermine und ihre Monatsstunden werden eingegrenzt. Die Stunden enthalten alle im Monat geplanten Schichten dieser Personen, auch bei einem vorübergehenden Dienst in einer anderen Gruppe. **Ampel und Konflikt-/Hinweiszahlen gelten weiterhin für den Gesamtplan**, bei gewählter Gruppe steht dies zusätzlich im Status. Gemeinsame Früh-/Spätbetreuung wird nicht künstlich auf Gruppen verteilt oder doppelt gezählt.

- Nettozeiten ausschließlich über `workTime` aus vorhandenen Schichten und erfassten Pausen im gewählten Monat; Wochenenddienste zählen mit. Keine neuen Sollstunden, Überstunden, Zuschläge, Abwesenheitsgutschriften oder Standardpausen.
- Personalampel unverändert über `calculateStaffing`, Statusbeschriftungen aus `STAFFING_LABELS`. Unklare Pausen/Halbtage und fehlende Konfiguration bleiben ungeklärt bzw. nicht konfiguriert.
- `checkPlan` wird für die vollständigen ISO-Wochen ausgeführt, die den Monat berühren. So wird ein Monatszeitraum niemals gegen einen Wochenvertrag geprüft. Tageskarten zählen Meldungen, die auf das jeweilige Datum fallen; wochenbezogene Hinweise bleiben am von der bestehenden Prüfung vergebenen Datum. Vollständige Details stehen im Wochenplan.
- Montag–Freitag bleibt sichtbar. Samstag/Sonntag nur bei tatsächlich vorhandener Schicht oder passendem Sondertermin in der gewählten Personenansicht, einschließlich Wiederholungen. Reine Wochenendabwesenheiten erzeugen keinen regulären Betreuungstag. Ohne ausdrücklich konfigurierten Sonderbedarf bleibt „Bedarf nicht festgelegt“ bestehen.
- Mehrere Schichten bzw. Abwesenheitseinträge derselben Person erhöhen den Personenzähler pro Tag nicht mehrfach. Eine Person kann zugleich geplant und abwesend sein; der Widerspruch wird nicht automatisch korrigiert.

Die 11-Personen-Demo funktioniert unverändert: 3/4/4 Gruppen, Januar-Beispiel 333 gespeicherte Netto-Stunden, Sonntags-Gottesdienst ohne reguläre Wochenendplanung. Monate mit nur einem Teil der Demo-Woche zeigen entsprechend nur deren tatsächliche Schichttage/-stunden.

Keine neuen Speicher-Keys, Datenformate, Abhängigkeiten, Cloud-/Supabase-/Reset-Änderungen oder Planungsalgorithmen. Die Übersicht verwendet dieselben geladenen Daten und denselben aktiven lokalen/Cloud-Arbeitsbereich wie die Wochenansicht; sie schreibt keine Daten.

## Prüfung

Sieben gezielte Tests: Monats-/Jahreswechsel, Schaltjahre und Grenzen; dynamische 3/4/4-Filter und Demo-Stunden; Monatsgrenzen/mehrere Schichten/Halbtage; Wochenend-Sonderschichten und wiederkehrende Termine; Vergleich mit bestehenden Ampel-/Prüffunktionen und unveränderte Quellen; Monats-/Gruppen-/Tagescallbacks; tatsächlicher Wechsel zurück in die korrekte Woche und Fokusziel auf iPhone/Desktop. Zusätzlich die sieben P10-Demo-/Ansichtstests, TypeScript und Produktionsbuild.

Browser wegen bekannter Sandbox-Blockade nicht gestartet. Manuell auf iPhone prüfen: Monatsauswahl, kleine Bildschirme ohne seitliche Überläufe, Stammgruppenfilter, Stundenliste aller elf Personen, Sonntags-Tagesklick und danach Schichtbearbeitung. Am Desktop Kalenderausrichtung an Monatsgrenzen, Tagesfokus und Rückkehr zur Wochen-/Druckansicht prüfen.
