# P12 – Woche kopieren und direkter Monatszugang

## Kopieren

1. Im **Wochenplan → Woche kopieren** öffnen. Die Aktion bezieht sich auf den gespeicherten aktuellen Arbeitsplan für **alle** Personen/Gruppen, unabhängig vom Ansichtsfilter. Während Generatorvorschau oder veröffentlichter Snapshot angezeigt wird, ist sie nicht verfügbar.
2. Je ein Datum in Quell- und Zielwoche auswählen und **Kopiervorschau prüfen**. Die Vorschau zeigt beide ISO-Kalenderwochen mit Datumsbereichen, übertragbare/übersprungene Schichten, neue Nettozeit und die Prüfung des kombinierten Zielplans.
3. Übersprungene Schichten und verbliebene Prüfmeldungen prüfen. Nur nach ausdrücklich gesetzter Bestätigung **Bestätigte Kopie speichern** wählen. Danach öffnet sich die Zielwoche. Abbrechen oder Ansichtswechsel verwirft nur die temporäre Vorschau.

Schichten werden auf denselben Wochentag abgebildet, mit neuen eindeutigen IDs und unveränderten Zeiten, Pausen (auch nicht erfassten), Mitarbeiter- und Gruppenzuordnungen. Aktuelle Mitarbeiternamen dienen weiter als historische Beschriftung. Quelle und bereits vorhandene Zielschichten bleiben als Datensätze erhalten. Es werden ausschließlich tatsächlich vorhandene Schichten übertragen: ein Sonntags-Termin erzeugt keine Wochenendschicht, echte Samstag-/Sonntagschichten bleiben Sonderschichten. Keine Termine, Abwesenheiten, Sollbedarfe oder Freigaben werden mitkopiert.

Überschneidungen mit bestehenden/vorgemerkten Zielschichten, Ziel-Abwesenheiten (auch zeitlich ungeklärte Halbtage), überlappende Sondertermine einschließlich Wiederholungen, fehlende Personen/Gruppen sowie verletzte vorhandene Verfügbarkeiten und ausdrücklich konfigurierte Grenzen werden konservativ übersprungen und begründet. Gewünschte Dienste während eines Sondertermins können anschließend bewusst im vorhandenen Schichteditor geprüft/eingetragen werden. Keine erfundenen Halbtag- oder Pausenzeiten. Verbindliche Tageszeiten werden für vollständige Personentage geprüft, damit passende geteilte Schichten kopierbar bleiben.

Die vorhandene `checkPlan`-Prüfung gilt für den kombinierten Zielplan. Neu zugeordnete persönliche harte Konflikte werden aussortiert. Bestehende Konflikte/offene Mindestbesetzungen im Ziel werden nicht durch Löschen oder automatische Planung behoben; verbleibende Planmeldungen werden angezeigt und müssen bei der Bestätigung bewusst geprüft werden. Eine Kopie ist keine Veröffentlichung. Zeitlich ungeklärte Pausen und Wochenstundenabweichungen bleiben Hinweise. Kein automatischer Planer und keine Freitext-/Rechtsinterpretation.

## Freigaben und Speichersicherheit

Bereits veröffentlichte **Zielwochen sind gesperrt**, auch wenn ihr Arbeitsplan nachträglich geändert wurde. Quellwochen dürfen als aktueller Arbeitsplan gelesen werden; ihre unveränderlichen Veröffentlichungssnapshots bleiben exakt erhalten. Vor jeder Übernahme werden Stammdaten, Quelle/Zielschichten, Abwesenheiten, Termine, Freigaben und Arbeitsbereichskennung erneut mit dem Vorschau-Stand verglichen. Anschließend wird die gesamte Vorschau mit denselben neuen IDs erneut geprüft; geänderte Vorschau-/Speicherstände verlangen eine neue Prüfung.

Alle neuen Schichten werden gemeinsam mit einem einzigen Schreibvorgang im bestehenden `kitaplanio-lite:shifts:v1`-Vertrag gespeichert (im Cloud-Arbeitsbereich über den unveränderten bestehenden Storage-Adapter). Keine Schleife einzelner Schichtspeicherungen und kein eigener Storage-Key. Ein Speicherfehler verändert keinen Teilplan. Es gibt keinen Cloud-Aufruf, keine Schema-/RLS-/Sync-/Reset-/Datenformatänderung und keine neue Abhängigkeit.

## P11-Zugang

Die Monatsansicht war bereits implementiert, aber nur über den Ansichtsumschalter erreichbar. **Monatsübersicht** ist nun direkt in der Desktop-Navigation und auf dem iPhone unter **Mehr** verlinkt (`#monatsplan`). Der bestehende `SchedulePage` öffnet dabei seine vorhandene Monatsansicht; es gibt keine zweite Monatsimplementierung. Umschalter und Tagesklick synchronisieren `#dienstplan`/`#monatsplan`, ohne das gewählte Datum innerhalb des Dienstplans zu verlieren. Offene Bearbeitung/Generatorvorschau wird durch eine externe Monatsnavigation nicht verworfen; der Wechsel erfolgt nach deren Abschluss mit sichtbarem Hinweis. Veröffentlichte Vorschau wird beim Monatswechsel nur abgewählt, nicht geändert.

## Prüfungen

Sieben gezielte Kopiertests mit der 11-Personen-Demo (3/4/4, 07:00–16:00): 53 Schichten, Zuordnungen/Zeiten/Pausen, ein atomarer Write, wiederholtes Kopieren ohne Duplikate, vorhandene Zielschichten, Ziel-Abwesenheiten/Halbtage und Terminserien, echte Wochenendschichten über den ISO-Jahreswechsel, gesperrte Ziele und unveränderte Quell-Snapshots, veraltete/geänderte Vorschauen, Arbeitsbereichswechsel, ID-/Schreibfehler, Verfügbarkeiten/Grenzen und geteilte feste Tagesdienste. Dazu drei Navigations- und sieben bestehende Monatstests sowie TypeScript/Produktionsbuild.

Keine Browser-/Serverstartversuche wegen bekannter Sandbox-Blockade. Nach Merge/Deployment manuell auf iPhone prüfen: „Mehr → Monatsübersicht“, Tagesauswahl zum Wochenplan, Quell-/Zielwochenwahl, lange Überspringen-/Prüflisten und Bestätigung. Desktop: Navigation, Erhalt gewählter Daten und Zielplan nach Übernahme prüfen. Die lokale Datenbasis niemals zum Aktualisieren der App löschen.
