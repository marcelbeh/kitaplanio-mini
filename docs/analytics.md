# P14 – Auswertungen & Dienstverteilung

**Auswertungen** ist direkt in der Desktop-Navigation und auf dem iPhone unter **Mehr** erreichbar (`#auswertungen`). Kalenderwoche oder Kalendermonat wählen, vor-/zurückblättern oder ein Datum bzw. einen Monat auswählen. Der Stammgruppenfilter verwendet die vorhandenen Gruppen dynamisch. Sortierung nach Name oder absteigend nach Nettozeit/Dienstart gilt gleichermaßen für Tabelle und mobile Karten. Team-Summen beziehen sich auf die aktuelle Auswahl.

## Kennzahlen ohne neue Planungsregeln

- Nettozeit über `dutyCounts`/`workTime`: jede gespeicherte Schicht einmal, alle erfassten Pausen abgezogen. Fehlende Pausen bedeuten keinen erfundenen Standardabzug und werden gekennzeichnet. Es werden geplante, nicht tatsächlich geleistete Stunden ausgewertet.
- Früh-/Spät-/Wochenendtage über den vorhandenen `dutyCounts`-Helfer; Kernanteile über `shiftPeriods`, zusammengefasst je Person und Datum. Keine zweite Stunden- oder Zeitgrenzenlogik.
- Ein Datum kann je Person Früh-, Kern- und Spätdienst enthalten. Mehrere Teilschichten derselben Art erhöhen den Tageszähler nicht. Die Stunden werden unabhängig von der Zahl der berührten Arten nur einmal addiert. Team-Gesamtsummen zählen Personendiensttage, keine unterschiedlichen Kalendertage.
- Nur tatsächliche Samstag-/Sonntagschichten zählen als Wochenenddienste. Ein kirchlicher Sondertermin ohne Schicht erzeugt keine Stunden oder Dienste.
- Zeitgrenzen und Stammgruppen folgen den aktuell gespeicherten Daten, nicht einer nicht vorhandenen historischen Konfiguration. Der Stammgruppenfilter enthält alle Schichten der zugeordneten Personen, auch bei zeitweiliger Arbeit in einer anderen Gruppe.

## Verteilung einordnen

Dezente, aufklappbare Hinweise verwenden unverändert `fairnessReport` aus P6c. Es gibt keinen neuen Grenzwert, Gesamt-Score, Ranking nach Gerechtigkeit oder automatische Planänderung. Übernommen werden nur Früh-/Spätverteilungshinweise aus vollständigen ISO-Wochen; im Monatsmodus bleiben Randwochen ohne Verteilungsbewertung. Ihre Stunden/Dienste werden selbstverständlich vollständig innerhalb des Monats gezählt.

Die bestehende Prüfung normalisiert nach hinterlegten Wochen-Vertragsstunden und vergleicht nur gemäß ihren vorhandenen Kriterien vergleichbare Arbeitstage, Verfügbarkeiten, Abwesenheiten und feste Vorgaben. Wünsche/Teilpläne können Unterschiede weiterhin erklären. Bei fehlenden/ungelesenen Stammdaten, Abwesenheiten oder Zeitdefinitionen werden keine Verteilungshinweise erzeugt. Keine Aussage von Ungerechtigkeit; Hinweise ersetzen keine fachliche Einordnung.

Verlässliche aktuelle Wochen-Vertragsstunden erscheinen lediglich als Kontext zusammen mit Arbeitsrahmen und erfasster Abwesenheit. Eine Vertrags-/Verfügbarkeitshistorie bzw. verlässliche Monats-Sollstunden existiert nicht. Deshalb **kein Monats-Soll, keine Überstunden, keine fiktiven Abwesenheitsgutschriften und kein Ist-/Soll-Saldo**. Auch frühere Wochen werden nur unter den heute hinterlegten Voraussetzungen betrachtet; dies ist in der Oberfläche ausdrücklich beschrieben.

## Fehlende und historische Daten

Leere Zeiträume zeigen vorhandene Mitarbeitende mit null geplanten Werten. Null Schichten wird nicht als Inaktivität interpretiert; das vorhandene Mitarbeitermodell hat keinen eigenen Inaktiv-Status. Entfernte Stammdaten mit historischen Schichten/Abwesenheiten werden über `schedulePeople` weiterhin angezeigt, ohne Vertragsstunden zu erfinden. Bei nicht lesbaren Stammdaten heißt dies ausdrücklich „Stammdaten nicht lesbar“, nicht „ausgeschieden“.

Nicht lesbare Schichten erzeugen **—**, keine scheinbaren Nullstunden. Ohne verlässliche Kita-Zeiten bleiben Früh/Kern/Spät unbekannt; tatsächlich lesbare Stunden und Wochenendtage bleiben auswertbar. Datenfehler werden angezeigt und können über „Daten erneut lesen“ erneut geprüft werden. Keine automatische Korrektur oder Speicherung.

## Technik und Prüfung

Nur lesende Loader des bestehenden lokalen/Cloud-Arbeitsbereichs; alle Filter und Ansichtsoptionen bleiben im React-Zustand. Keine neuen Speicher-Keys, Datenformate, Abhängigkeiten, Cloud-/Supabase-/Reset-/Vorlagenänderungen oder Migration. Keine Schichtänderung und keine Schreibaktion durch Aufruf oder Darstellung der Auswertungsseite.

Acht gezielte Tests: Nettozeit/Teilschichten/Mehrfacharten, exakte Grenzen und fehlende Pausen, tatsächliche Wochenenden, ISO-/Monatsgrenzen und Navigation, 11-Personen-Demo mit 3/4/4-Gruppen/Team-Summen, historische/fehlende Daten, kontextbezogene Verteilung/Teilzeit/Abwesenheit/Verfügbarkeit und Monatsrandwochen sowie gerenderte mobile Karten ohne einen einzigen Speicherwrite. Dazu fünf Navigationstests, TypeScript und Produktionsbuild.

Manuell auf iPhone offen: Woche/Monat wechseln, Datumsauswahl, Gruppenfilter, Sortierung aller elf Karten, Hinweise aufklappen und keine horizontalen Seitenüberläufe. Desktop: Tabelle, Summen und historische Zeilen. Wegen bekannter Sandbox-Blockade keine Browser-/Serverstartversuche.
