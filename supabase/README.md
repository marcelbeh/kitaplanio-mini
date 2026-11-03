# Supabase-Vorbereitung für KitaPlanio Lite

Nur das minimale lokale CLI-Grundgerüst ist vorbereitet. `config.toml` enthält die lokale Projektkennung; sie verknüpft das Repository nicht mit dem gehosteten Supabase-Projekt. Es wurden keine Supabase-Befehle ausgeführt, keine Tabellen, Migrationen oder Konten erstellt und keine Cloud-Einstellungen verändert. Die App verwendet weiterhin ausschließlich ihre vorhandene lokale Speicherung; es gibt noch keinen Supabase-Client und keine neuen Abhängigkeiten.

## Bekanntes Zielprojekt

- Supabase-Projekt: `kitalono-lite`
- Projekt-Referenz: `gnqcuycuolphtfmdunax`
- API-URL: `https://gnqcuycuolphtfmdunax.supabase.co`

Referenz und URL sind Projektmetadaten, keine Zugangsdaten. Die Supabase-API-URL ist keine Live-Adresse der React-Oberfläche.

## Für die spätere Verbindung noch erforderlich

- Publishable API Key aus den Projekteinstellungen. Für einen späteren Frontend-Client sind `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` als lokale bzw. Hosting-Umgebungsvariablen vorgesehen. Die App liest diese Variablen derzeit noch nicht ein. Hier wird kein Schlüssel hinterlegt.
- Bei späterer CLI-Verknüpfung eine lokal authentifizierte Supabase-CLI und gegebenenfalls das Datenbankpasswort, ausschließlich außerhalb des Repositories. Projekt-Referenz und Berechtigungen vor dem Verknüpfen erneut prüfen.
- Vor einer Datenübertragung müssen Datenmodell, Zugriffsregeln und Übernahme der bestehenden Browserdaten separat festgelegt werden. Dies ist nicht Teil dieser Vorbereitung.

Lokale `.env`-Dateien, CLI-Verknüpfungsdaten und temporäre Supabase-Dateien sind per `.gitignore` ausgeschlossen. Datenbankpasswörter, Access Tokens, Secret Keys und `service_role`-Schlüssel gehören niemals in das Repository oder den Browser-Code.

Referenz: [Supabase CLI-Konfiguration](https://supabase.com/docs/guides/local-development/cli/config).
