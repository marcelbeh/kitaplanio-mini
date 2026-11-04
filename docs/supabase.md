# P8a: private Cloud-Grundlage

P8a ergänzt ausschließlich Anmeldung und eine sichere Datenbankgrundlage. Alle Kita-, Mitarbeiter-, Abwesenheits-, Termin-, Schicht- und Freigabedaten bleiben lokal. Es gibt **keinen automatischen Upload, Download oder Import**. „Cloud verbunden“ bedeutet: Supabase hat das Konto und dessen administrative Freigabe bestätigt. Die Anmeldung sperrt keine bereits lokal gespeicherten Daten auf einem gemeinsam verwendeten Gerät.

## Vorhandenes Projekt

Das vorhandene Projekt **kitalono-lite** (Ref `gnqcuycuolphtfmdunax`) wird wiederverwendet. Keine neue Instanz erstellen. Die Migration `supabase/migrations/20261104064620_caro_private_cloud.sql` ist dort bereits unter derselben Version angewendet. Bestehende Tabellen/Datensätze wurden nicht gelöscht oder überschrieben. Die aktuelle CLI scheiterte in dieser Sandbox beim Anlegen von `/home/agent/.supabase` mit `EROFS`; die Migration wurde deshalb mit der kompatiblen CLI 2.81.3 erzeugt und an die tatsächlich angewendete Projektversion angeglichen. Keine erweiterten Home-Verzeichnis-Berechtigungen sind nötig.

Die Migration ist absichtlich nicht überschreibend: auf einem bereits eingerichteten Projekt nicht erneut als beliebiges SQL ausführen.

- `public.caro_members`: `user_id` und `enabled`, administrativ verwaltete Freigabe. Browser dürfen nur die eigene aktive Freigabe lesen, niemals sich selbst freischalten.
- `public.caro_app_data`: ein eigentümergebundener JSONB-Container pro Benutzer für spätere App-Daten. Lokale versionierte Objekte könnten unverändert unter ihren bisherigen Keys in `payload` verschachtelt werden. **P8a liest/schreibt diesen Container nicht.**
- Beide Tabellen verwenden RLS. Jede Datenoperation verlangt serverseitig `auth.uid() = owner_id` und eine aktive Freigabe. UPDATE prüft sowohl vorherigen als auch neuen Eigentümer. Anonymous-Sessions erhalten auch mit bekanntem UID keinen Zugriff.
- Die versehentlich öffentlich ausführbare bestehende Eventfunktion `public.rls_auto_enable()` hat ihre Client-Ausführungsrechte verloren; die Eventfunktion selbst und ihr Trigger wurden nicht gelöscht.

## Noch manuell im Supabase-Dashboard einzurichten

1. Im bestehenden Projekt **Authentication → Sign In / Providers** E-Mail-/Passwort-Anmeldung aktivieren. Unter **User Signups** „Allow new users to sign up“ ausschalten. Anonymous Sign-ins ausschalten; unnötige weitere Login-Provider deaktivieren. Diese Auth-Konfiguration konnte mit den verfügbaren Projektwerkzeugen nicht geändert werden. Die Datenbank-Freigabeliste verhindert unabhängig davon Zugriff durch nicht freigeschaltete Konten.
2. Unter **Authentication → URL Configuration** die Site URL `https://marcelbeh.github.io/kitaplanio-mini/` setzen. Nur benötigte Redirect-URLs freigeben. P8a verarbeitet bewusst keine Auth-Tokens im URL-Hash, damit die vorhandene App-Navigation erhalten bleibt.
3. Unter **Authentication → Users → Add user / Create user** ausschließlich gewünschte Konten administrativ mit E-Mail und Passwort erstellen/bestätigen. Keine öffentliche Registrierung verwenden. Passwörter nicht ins Repository, in Logs oder in Tickets kopieren.
4. Die UUID des gewünschten Kontos unter Users nachsehen und im SQL Editor administrativ freigeben (Platzhalter ersetzen, nicht im Browser ausführen):

   ```sql
   insert into public.caro_members (user_id, enabled)
   values ('<UUID-des-administrativ-erstellten-Kontos>', true);
   ```

   Für ein bereits vorhandenes Freigabeobjekt gezielt `update public.caro_members set enabled = true where user_id = '<UUID>';` verwenden. Entzug: denselben Datensatz auf `enabled = false` setzen. RLS berücksichtigt den Entzug sofort bei jeder Datenoperation; die Anzeige wird bei Fokuswechsel, Auth-Änderung und spätestens nach 60 Sekunden erneut geprüft.
5. Auth-Einstellungen (Passwortschutz, Rate Limits und bei Bedarf MFA) sowie Mailzustellung administrativ prüfen. Es wird durch P8a keine Mail versandt.

Kein freigeschaltetes echtes Konto wurde durch den Agenten erzeugt. Ein echter E-Mail-/Passwort-Login/Logout und ein verweigertes Konto sind nach der Einrichtung noch manuell zu prüfen.

## Build und GitHub Pages

Im Dashboard unter **Project Settings → API Keys / Connect** die Projekt-URL und ausschließlich einen aktiven **Publishable Key** (`sb_publishable_…`) verwenden. Kein `sb_secret_…`, `service_role` oder Legacy-JWT-Key. Publishable Keys sind absichtlich im Browser sichtbar; die Sicherheit entsteht durch Auth und RLS, nicht durch Geheimhaltung dieses Keys.

GitHub Repository → Settings → Secrets and variables → Actions:

- Variable `VITE_SUPABASE_URL`: HTTPS-Projekt-URL aus dem bestehenden Projekt.
- Secret `VITE_SUPABASE_PUBLISHABLE_KEY`: dessen Publishable Key (kein Server-Key).

Der Pages-Workflow übernimmt nur diese beiden Werte beim Build. Ohne beide Werte bleibt die App vollständig lokal nutzbar. Eine teilweise/unsichere Konfiguration stoppt den Build mit einer Meldung ohne die Werte auszugeben. Nur statische Zugriffe auf diese beiden Vite-Variablen werden eingebunden; andere Build-Umgebungswerte werden nicht als Ganzes ins Bundle übernommen. GitHub-Konfigurationswerte wurden nicht automatisch angelegt.

Für lokale Entwicklung `.env.example` nach `.env.local` kopieren und die Platzhalter ersetzen. `.env*` ist außer `.env.example` ignoriert. Die einzige neue App-Abhängigkeit ist die fest gepinnte offizielle `@supabase/supabase-js`-Version; Lockfile ist mit versioniert. Ein SDK-eigener Auth-Speicher `caro:auth:v1` ist getrennt von allen bestehenden App-Daten. Abmelden löscht keine Kita-/Dienstplandaten. Browsergeräte nicht gemeinsam mit unbefugten Personen verwenden.

Pages-Pfad, Manifest-ID, Service Worker und PWA-Icons bleiben erhalten. Merge löst den bestehenden Pages-Workflow aus. Erst nach erfolgreichem Deployment ist die Anmeldung unter der bestehenden URL verfügbar. Ohne Build-Konfiguration bleibt dort „Lokal“ sichtbar.

## Prüfungen

Die RLS-Negativtests in `supabase/tests/rls.sql` wurden auf dem bestehenden Projekt erfolgreich ausgeführt. Sie prüfen Eigentümer-CRUD, fremde SELECT/INSERT/UPDATE/DELETE, Eigentümerwechsel, fehlende Freigabe, Selbstfreischaltung, Entzug und Anonymous-Zugriff. Alle synthetischen Identitäten und Daten liegen in einer einzigen Transaktion mit abschließendem **ROLLBACK**; keine Testkonten oder App-Daten bleiben zurück. Keine E-Mail-Adressen oder produktiven Benutzer-IDs werden benötigt.

Zum erneuten kontrollierten Ausführen als Projektadministrator: `psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/rls.sql`. Die Verbindungsdaten niemals committen oder ausgeben. Diese Datenbanktests sind bewusst kein automatisch gegen Produktion laufender CI-Schritt. Der anschließende Supabase-Sicherheitscheck meldete keine Befunde.

`node tests/cloud.test.mjs`, TypeScript und Produktionsbuild prüfen lokal die vorbereitete Client-/Zugriffslogik. Ein Live-Browser-/Kontotest bleibt mangels freigegebenem Testkonto offen. Bekannte Browser-Sandbox-Blockade wurde nicht erneut provoziert.

## Offizielle Quellen (geprüft 2026-11-04)

- [Changelog](https://supabase.com/changelog.md), insbesondere TLS-Änderung vom 12.10.2026 (moderner Browser/Node-Client unterstützt moderne TLS-Verfahren).
- [E-Mail-/Passwort-Auth](https://supabase.com/docs/guides/auth/passwords)
- [JavaScript signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [Client initialisieren](https://supabase.com/docs/reference/javascript/initializing)
- [RLS und Eigentümerprüfungen](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [API-/Publishable-Keys](https://supabase.com/docs/guides/api/api-keys)

## P8b: manuelle Synchronisierung

P8b ergänzt den ausdrücklich geöffneten **Cloud-Arbeitsbestand**. Anmeldung allein startet keine Übertragung. Bestehende lokale Keys/Daten bleiben unverändert und über „Zu bisherigen lokalen Daten“ erreichbar. Logout wechselt dorthin zurück, ohne den Cloud-Zwischenstand zu löschen. Wie bisher schützen Auth/RLS die Cloud, nicht den lokalen Browser eines gemeinsam genutzten Geräts.

### Einrichtung nach Merge

1. Die additive Migration `supabase/migrations/20261104084456_caro_sync_cas.sql` einmal im bestehenden Projekt anwenden (Supabase CLI `db push` mit geprüfter Migrationsliste, alternativ kontrolliert im SQL Editor). Sie wurde im Projekt gemeinsam mit den SQL-Tests **innerhalb einer vollständig zurückgerollten Transaktion** geprüft, aber noch nicht dauerhaft installiert. Sie ändert keine bestehenden Payloads und schaltet keinen Bestand automatisch frei. Keine P8a-Migration erneut ausführen.
2. `caro_app_data` erhält `revision`, `sync_initialized` und `updated_at`. Direkte Browser-Schreibrechte entfallen; nur `caro_sync_cas(expected_revision,payload)` darf einen freigegebenen eigenen, ausdrücklich initialisierten Datensatz aktualisieren. Der private Worker prüft `auth.uid()`, aktive Mitgliedschaft und nicht-anonyme Anmeldung erneut. Prüfung, vollständiger Ersatz und Versionsinkrement laufen in derselben DB-Transaktion; veraltete Versionen erhalten kein Ergebnis. Keine Inserts/Upserts durch den Client.
3. **Noch keine Erstmigration vornehmen.** P8c muss einen geprüften vollständigen Bestand nach ausdrücklicher Zustimmung einrichten und `sync_initialized` setzen. P8b kann deshalb bei bislang nur lokalen Daten noch nicht synchronisieren; es zeigt einen entsprechenden P8c-Hinweis. Niemals einen leeren Payload oder `sync_initialized=true` als Abkürzung eintragen. Existierende P8a-Container bleiben bis zur bewussten Einrichtung uninitialisiert.
4. Nach dieser Einrichtung dasselbe freigeschaltete Konto auf Mac und iPhone verwenden und je Gerät „Cloud-Datenbestand öffnen“ bestätigen. Dies lädt einen vorhandenen Cloud-Bestand in einen getrennten Cache, ohne den alten lokalen Bestand zu importieren. Ein vorhandener Cache wird mitsamt Offline-Änderungen wieder geöffnet, nicht automatisch durch die Cloud ersetzt.

### Datenvertrag und Konflikte

`payload` enthält **vollständig** sieben bisherige Keys als JSON-Objekte oder `null`: Kita (einschließlich Gruppen/Planungsregeln), Interview-Zwischenstand, Mitarbeitende (einschließlich Wünsche/Sperrregeln), Schichten/Pausen, Abwesenheiten, Sondertermine und veröffentlichte Wochenversionen. Die bisherigen versionierten Objekte bleiben unverändert. Leere Arrays und `null` werden als vollständiger Zustand übertragen, nicht zusammengeführt. Unbekannte/unvollständige Formate werden abgelehnt. Vorhandene veröffentlichte `(from,version)`-Snapshots dürfen serverseitig weder entfernt noch verändert werden.

Ein lokaler Cloud-Cache pro Benutzer (`caro:sync-workspace:v1:<UUID>`) enthält Basisversion, vollständigen Basis-/Arbeitsstand und letzten Synchronisierungszeitpunkt. Ein einzelnes `localStorage.setItem` schreibt zusammengehörige Daten atomar. `caro:sync-active:v1` wählt nur den ausdrücklich geöffneten Arbeitsbestand; Geschäftsmodelle und ihre alten Keys bleiben gleich. Speicherfehler werden nicht als Erfolg gemeldet.

„Jetzt synchronisieren“ prüft Auth/Freigabe und Cloud-Stand. Bei unveränderter Cloud werden lokale Änderungen per CAS übertragen. Bei abweichenden Beständen ist eine explizite Entscheidung erforderlich, auch bei rein eingehenden Änderungen. „Lokal behalten“ verlangt eine zweite Bestätigung, erneutes Lesen und CAS. Ein inzwischen geänderter Stand verlangt eine neue Entscheidung. „Cloud übernehmen“ prüft erneut, übernimmt lokal den gesamten Bestand mit einem Schreibvorgang und behält den ersetzten Arbeitsstand als `backup` im selben lokalen Cache. Abbrechen schreibt nichts. Es gibt keine automatische Zusammenführung. Kollisionen unveränderlicher Wochenversionen müssen vor einer Übernahme manuell geklärt werden; P8b löst sie nicht durch Löschen. Die Sicherung ist kein dauerhaftes Versionsarchiv und wird bei einer späteren ausdrücklich bestätigten Übernahme ersetzt.

Offline wird weiter lokal gespeichert; Wiederverbinden löst **keine** Synchronisierung aus. Änderungen während einer laufenden Übertragung bleiben lokal markiert. Bei verlorener Netzwerkantwort kann die Cloud bereits vollständig gespeichert haben; ein erneuter manueller Abgleich erkennt übereinstimmende Inhalte oder zeigt einen Konflikt, statt blind erneut zu schreiben. Offene ungespeicherte Formulare/Generatorvorschläge werden bei ausdrücklich bestätigtem Arbeitsbestandswechsel neu geladen.

### Nachweise und offene manuelle Tests

- `node tests/sync.test.mjs`: zwei Geräte, CAS-Rennen/erneute Bestätigung, leere Sammlungen/Löschungen, Offline/Quota, Logout, Änderungen während Upload, unveränderliche Freigaben, keine Erstinitialisierung.
- `supabase/tests/rls.sql`: synthetische Identitäten, eigene/fremde SELECTs, CAS/stale revisions, fehlende Freigabe/anonymous, verbotene direkte Writes, unveränderliche Freigaben und fehlende Initialisierung. Alle Fixtures werden zurückgerollt. Die Datei setzt jetzt P8b voraus. Keine produktiven Payloads werden gelesen oder verändert.
- TypeScript, Build und gezielte bestehende Auth-/Dienstplan-/Freigabetests. Browsercheck wegen bekannter Sandbox-Blockade nicht erneut gestartet. Nach Migration und P8c-Einrichtung: echter Zwei-Geräte-Abgleich, Offline/Reconnect, Konfliktwahl und iPhone-/Mac-Darstellung manuell prüfen.
- Supabase Advisor meldet aktuell **„Leaked Password Protection Disabled“**. Im Dashboard bei verfügbarem Tarif aktivieren: [Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Keine Auth-Konfiguration wurde automatisch verändert.

Aktuelle Referenzen: [DB-Funktionen, Transaktionen und Ausführungsrechte](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Datenzugriff absichern](https://supabase.com/docs/guides/database/secure-data). Live erst nach Merge und erfolgreichem Deployment: https://marcelbeh.github.io/kitaplanio-mini/.

## P8c – bestätigte lokale Erstübernahme

Die spätere Erstübernahme, Pflichtsicherung, Wiederaufnahme und neue SQL-Migration sind in [p8c.md](p8c.md) beschrieben. Migration vor Aktivierung installieren; bestehende Cloud-Bestände werden niemals überschrieben oder automatisch zusammengeführt.
