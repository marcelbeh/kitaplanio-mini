# P17 · Dienstplan-Cockpit

Basis: main `37c172a24c0ba214df314e4bbe4ce30333a848ca` mit P16. Bestehende Wochen-/Tagesansicht, Ampeln, filterbare Konfliktliste, versionierte Freigabe und Browserdruck sind bereits vorhanden und bleiben erhalten. Kein neuer Navigationsbereich nötig: Das Cockpit steht oben im bestehenden Wochenplan.

## Ergänzungen

- Kompakte Tageskarten für die bereits sichtbaren Wochentage mit dem **unveränderten Ergebnis der vorhandenen Besetzungsberechnung**, Anzahl geplanter Personen, Personen mit Abwesenheit, Konflikten/Hinweisen und Sonderterminen. Mehrere Dienste derselben Person zählen bei der Personenanzeige einmal; Arbeitsstunden werden nicht neu berechnet. Wochenenden werden über die bestehende Sichtbarkeitslogik eingeblendet; kein regulärer Wochenendbedarf wird erzeugt.
- Höchstens fünf offene Aufgaben, mit wenigstens einer vorhandenen Meldung zu Unterbesetzung, fehlender Pausendauer und ungeklärter Pausenlage, soweit vorhanden. Ursache und möglicher nächster Schritt stammen aus der vorhandenen Regelprüfung. Die vollständige Konfliktliste mit ihren Filtern bleibt die ausführliche Ansicht. Wochenbezogene Hinweise sind weiterhin am Wochenanfang datiert und entsprechend erläutert.
- Cockpit und vorhandene Konfliktliste nutzen dieselbe Sprungaktion: Datum wählen, störenden Gruppenfilter zurücksetzen und bei eindeutiger Zuordnung den tatsächlichen Schichtbutton fokussieren. Zuordnung ausschließlich anhand vorhandener IDs, auch mit Doppelpunkten; kein Raten anhand von Namen. Bei mehreren betroffenen Diensten, Überschneidungen, bereichsbezogener Unterbesetzung oder nicht auflösbaren Meldungen öffnet sich nur der Tag. Gesperrte bestehende Dienste einer Generatorvorschau bleiben gesperrt; der Tageskopf ist das sichere Sprungziel. Keine automatische Bearbeitung oder Datenänderung.
- „Zur Freigabe“ fokussiert den bestehenden Freigabebereich; „Zu PDF / Druck“ die vorhandene Druckquellenauswahl. Diese Aktionen veröffentlichen/drucken selbst nichts und umgehen keine Bestätigung oder Sperre. In einer Generatorvorschau sind sie deaktiviert. Eine ausgewählte veröffentlichte Version zeigt weiterhin ausschließlich die vorhandene Snapshot-/Druckansicht statt aktueller Cockpit-Befunde; Arbeitsplan und Snapshot werden nicht vermischt.
- caro.-Farben, Karten, Buttons und Touch-Flächen werden wiederverwendet. Neue Cockpit-Inhalte erscheinen nicht im Team-Ausdruck.

## Verifikation

Sechs fokussierte Fälle in `tests/cockpit.test.mjs`: eindeutige/mehrdeutige Dienstzuordnung samt komplexen IDs, konkrete Aufgaben, unveränderte Tagesstatus/Personenzählung und Wochenendnavigation, leere/unvollständige Daten, tatsächliche Verdrahtung der Wochenansicht mit Filterauflösung/Desktop-/Mobilzielen/Freigabe-/Drucksprüngen sowie Weiterverwendung der bestehenden Konfliktliste. Navigationsaktionen haben im Test keinerlei Schreibzugriff.

Bestehende Tests für Navigation, Freigaben/Druck, P16-Planungsqualität und Monatsansicht: ebenfalls erfolgreich. Insgesamt 27 Testfälle in fünf Testdateien. TypeScript und Produktionsbuild prüfen; keine neue Abhängigkeit.

## Grenzen und manuelle Tests

- Browserstart wird in der bekannten blockierten Sandbox nicht erneut versucht. Offen auf Mac/Safari: Rasterfokus und horizontales Scrollen zum Dienst, Tastatur, lange Meldungen, Freigabebestätigung, Druckquelle und A4-Ausgabe. Auf iPhone: Zweispalten-Tageskarten, Tag-/Dienstsprünge, Touch-Flächen und kein Seitenüberlauf.
- Keine automatische Problemlösung. Bei einer nicht eindeutig einem Dienst zuordenbaren Meldung muss die Leitung den passenden Dienst im Tag auswählen. Das Cockpit zeigt eine Auswahl, keine zusätzliche zweite Konfliktverwaltung.
- Gruppengefilterte Personenansichten ändern die teamweiten Ampeln/Aufgaben nicht. Speicherprobleme werden ausdrücklich als unvollständige Prüfung angezeigt; eine leere Aufgabenliste ist keine fachliche Freigabe.
- Keine Geschäftsregeln, Generatoralgorithmen, Speicher-Keys, Datenformate, Veröffentlichungen oder Cloud-Pfade geändert. Keine KI, APIs, SQL-Migration oder produktive Supabase-Änderung. P15 ist nicht Teil dieses PR.

Nicht mergen oder deployen. Live erst nach gesondertem Merge und erfolgreichem Deployment: https://marcelbeh.github.io/kitaplanio-mini/ .
