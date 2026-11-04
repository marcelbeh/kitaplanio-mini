# P15 · Gemini-Planungsassistent

**Quellcode vorbereitet, nicht bereitgestellt. Keine SQL-Migration.** Cloud-Synchronisierung, Erstimport, Datenformate, Planungsvorgaben und produktive Daten bleiben unverändert.

## Bedienung

„KI-Assistent“ steht in der Desktop-Navigation und auf dem iPhone unter „Mehr“. Zunächst die externe Verarbeitung aktiv bestätigen; die Zustimmung gilt nur für diese Sitzung/Ansicht und wird bei Kontoänderung verworfen. Jede der vier Fragen startet genau eine Einzelanfrage für die ausgewählte Woche bzw. den Monat. Kein automatischer Aufruf bei Anmeldung, Start oder Reconnect und kein gespeicherter Chat.

Gemini erhält einen deterministischen Ausgangsvorschlag und strukturierte Fakten. Die KI kann zusätzliche Schichten vorschlagen und erklären. Alle Ergebnisse erscheinen zuerst als Vorschau. Bestehende Personalampel, Stunden-/Dienstzählung und Konfliktprüfung berechnen den kombinierten Plan lokal. KI-Text ist eine unbestätigte Einschätzung und kann diese Prüfungen nicht überstimmen.

Übernahme: Vorschau prüfen → „Vorschlag übernehmen“ → „Übernahme ausdrücklich bestätigen“. Der vorhandene atomare Generator-Schreibweg wird wiederverwendet. Direkt davor werden Konto-Freigabe, Arbeitsbereich, Quelldaten, Veröffentlichungen und Regeln erneut geprüft. Keine Speicherung vor Bestätigung; keine Änderung bestehender Schichten, kein Veröffentlichen und kein automatisches Synchronisieren. Verwerfen/Ansicht verlassen ändert keine Dienstplandaten.

## Daten und Grenzen

- Namen, ursprüngliche IDs und deren Zuordnung bleiben in der App. Personen/Gruppen werden pro Anfrage mit temporären P-/G-IDs bezeichnet.
- Keine E-Mails, Qualifikationen, Freitextregeln, Termintexte/-notizen, Abwesenheitsgründe, Interviewdaten oder veröffentlichten Snapshots. Die Nachrichten enthalten keine freien Benutzereingaben; vier strukturierte Fragen begrenzen unnötige Datenübertragung und Prompt-Injection.
- Wochenanfragen: erforderliche Zeiten, Vertragsminuten, strukturierte Wünsche/Verfügbarkeiten, Abwesenheitszeiträume/-anteile, Terminzeiten/-zuordnungen, Sollwerte und lokal berechnete Befunde. Nur bei konfigurierter Ruhezeitgrenze werden die dafür benötigten angrenzenden Schichten (maximal sieben Tage vorher/nachher) einbezogen. Monatsanalyse: nur pseudonyme Zuordnung, Vertragsminuten und vorhandene Stunden-/Dienstsummen; keine Einzelpläne, Verfügbarkeiten oder Abwesenheiten.
- Diese Pseudonymisierung ist **keine Anonymisierung**. Der eingerichtete Gemini-Tarif und Googles Bedingungen bestimmen die externe Verarbeitung/ggf. Aufbewahrung. Vor Einsatz mit Personalplanung fachlich und datenschutzrechtlich prüfen. Die Edge Function speichert/protokolliert keine Inhalte.
- Geschlossene Antwortformate werden server- und clientseitig validiert. Unbekannte Personen/Gruppen, zusätzliche Felder, erfundene Pausen, fremde Daten und neue Wochenenddienste werden zurückgewiesen. HTML/Befehle werden nicht ausgeführt.
- Nur neue Dienste in der Stammgruppe und an hinterlegten regulären Arbeitstagen. Abwesenheiten auch bei ungeklärten Halbtagen, uninterpretierbare Muss-Freitextregeln, konfigurierte Dauer-/Ruhegrenzen und ausgeschöpfte Vertragsstunden sperren die KI-Übernahme zusätzlich konservativ. Feste Tageszeiten/Überlappungen/Mindestbesetzung prüft die bestehende Regelprüfung. Sonderterminüberschneidungen bleiben sichtbare Hinweise zur bewussten Entscheidung der Leitung.
- Pausen neuer Dienste werden nicht erfunden und müssen anschließend manuell geprüft/eingetragen werden. Keine Optimierungs- oder Rechtsgarantie. Unvollständige Vorschläge können angezeigt, bei harten Konflikten aber nicht übernommen werden.
- Bereits veröffentlichte Zielwochen sind gesperrt. Bestehende Wochenenddienste/-termine werden analysiert. Da Sonderbedarfe bisher nur im manuellen Generatorentwurf existieren, erzeugt der KI-Assistent keine neuen Wochenenddienste. Dafür den bestehenden Generator mit explizitem Sonderbedarf oder die manuelle Planung verwenden.
- Fehlende/beschädigte oder historisch nicht mehr auflösbare Zuordnungen stoppen die Anfrage statt Daten zu erfinden. Ohne Gemini bleibt die bisherige regelbasierte Planung verfügbar.

## Spätere Einrichtung – nur nach gesonderter Freigabe

1. Änderungen/PR prüfen. Im vorhandenen Projekt **gnqcuycuolphtfmdunax** bleiben Tabellen, RLS und Daten unverändert. Bereits vorhandene `caro_members`-Freigaben werden wiederverwendet; keine öffentliche Registrierung aktivieren.
2. Im Supabase-Dashboard unter Edge Functions → Secrets das bereits vorhandene `GEMINI_API_KEY` belassen. Zusätzlich `GEMINI_MODEL` mit einem aktuell für `generateContent` und JSON-Schema-Ausgaben unterstützten Modell setzen (Dokumentationsstand 04.11.2026: z. B. `gemini-3.8-flash`; Verfügbarkeit im eigenen Google-Projekt prüfen). Kein stiller Modellwechsel/Fallback. `CARO_SUPABASE_PUBLISHABLE_KEY` auf den **Publishable Key dieses Projekts** setzen. Niemals einen Secret-/Service-Role-Key verwenden. `SUPABASE_URL` stellt die Edge-Laufzeit bereit.
3. Optional `CARO_ALLOWED_ORIGINS` setzen: kommaseparierte Origins, ohne Pfad/abschließenden Slash. Standard: `https://marcelbeh.github.io`. Lokale Entwicklung nur bei bewusst ergänztem lokalen Origin. Kein `*`.
4. Ausschließlich die Function `caro-assistant` aus `supabase/functions/caro-assistant/` mitsamt `../_shared/assistant-protocol.ts` bereitstellen. `supabase/config.toml` berücksichtigen: `verify_jwt = false`, weil Publishable Keys/aktuelle JWT-Signaturen nicht über den Legacy-Gateway-Check abgesichert werden sollen. **Die Function selbst verlangt immer einen User-Bearer-Token, prüft ihn via Auth `getUser(token)` und danach die eigene aktivierte `caro_members`-Zeile unter User-RLS.** Fehlende, anonyme, deaktivierte oder fremde Mitgliedschaften erhalten keinen Gemini-Aufruf. Bei CLI-Nutzung zuerst die installierte Version und deren `functions deploy --help` prüfen; CLI v3 hat geänderte Ziel-/Bestätigungsregeln. Nur die genannte Function und das genannte Projekt auswählen, keinen DB-Push ausführen.
5. Im Google-Projekt angemessene API-Quoten/Kostenbegrenzungen konfigurieren. Die Function begrenzt auf 256 kB Eingabe, 64 kB strukturierte Antwort, höchstens 160 neue Schichten, 8.192 Ausgabetokens, 30 Sekunden und einen Gemini-Aufruf ohne automatische Wiederholung. Zusätzlich maximal 20 Anfragen je Nutzer/Stunde, eine gleichzeitig je Nutzer und vier gleichzeitig **pro warmer Edge-Isolate**. Diese speicherbasierten Grenzen sind keine verteilte oder dauerhafte Abrechnungsquote; Neustarts/mehrere Isolates können sie vervielfachen. Harte Kostenkontrolle daher zusätzlich im Google-Projekt einstellen.
6. Erst nach gesonderter Freigabe mergen/Frontend bereitstellen. Auf dem Mac mit **fiktiven Testdaten** die folgenden manuellen Prüfungen durchführen. In diesem Auftrag wurden weder produktive Secrets/Funktionen verändert noch Gemini mit echten Personaldaten aufgerufen.

## Prüfungen

Automatisiert: `node tests/assistant.test.mjs` (13 gezielte Fälle) und `node tests/navigation.test.mjs` (6 Fälle). Gemini wird vollständig gemockt. Geprüft: aktive Zustimmung/Offline ohne Anfrage, Pseudonymisierung, Monatsminimierung, Format-/Zuordnungsprüfung, serverseitige Mitgliedschaft, verweigerte Anfragen, Konflikte/Abwesenheiten/Termine, Vorschau ohne Schreiben, Bestätigung, atomarer Fehlerfall, Daten-/Arbeitsbereichwechsel, Veröffentlichungen, API-Fehler/Timeout und Limits. TypeScript und Produktionsbuild müssen erfolgreich sein; die Edge-Dateien wurden zusätzlich mit TypeScript und minimalen Deno-Globaldeklarationen gegen die gepinnte SDK-Version geprüft. Deno-Runtime-/Deploymentprüfung bleibt offen (Deno hier nicht installiert).

Manuell offen (kein Browserstart in der bekannten blockierten Sandbox):

- Safari auf Mac: Desktop-Seitenbereich, Scrollen langer Vorschläge, Tastatur/Fokus, Bestätigung und Verwerfen.
- iPhone: „Mehr“, Datumseingabe, große Touch-Flächen, kein horizontaler Überlauf.
- Nach gesonderter Function-Bereitstellung: echter Modell-/JSON-Schema-Vertrag ausschließlich mit fiktiven Daten; CORS und erfolgreiche Anmeldung. Ohne JWT, ohne Freigabe, nach Deaktivierung und mit fremdem Konto keinen Gemini-Zugriff zulassen. Ein freigeschaltetes Konto darf nur eigene Mitgliedschaft verwenden; diese Function liest keine Cloud-Dienstplandaten.
- Kontowechsel/Logout während Anfrage, parallele Planänderung und Veröffentlichung während Vorschau; kein Speichern veralteter Vorschläge.

Aktuelle Referenzen: [Supabase Auth für Functions](https://supabase.com/docs/guides/functions/auth), [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys), [Changelog](https://supabase.com/changelog.md), [Gemini generateContent](https://ai.google.dev/api/generate-content), [strukturierte Ausgaben](https://ai.google.dev/gemini-api/docs/structured-output), [Modelle](https://ai.google.dev/gemini-api/docs/models), [Gemini-API-Bedingungen](https://ai.google.dev/gemini-api/terms).

Live-Testadresse nach späterem Merge und erfolgreichem Deployment: https://marcelbeh.github.io/kitaplanio-mini/
