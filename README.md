# CoMatch

Live-Matchmaking für Gründer*innen auf Präsenzveranstaltungen. Gesamtplan und Entscheidungen: [PLAN.md](PLAN.md).

**Stand:** M9 fertig, alle Meilensteine aus dem Plan sind umgesetzt. Admins konfigurieren Events (M1), Teilnehmende treten per QR-Code bei (M2), die Matching-Engine paart (M3), die Runden laufen live per Socket.IO (M4), der Spielablauf am Handy ist komplett (M5), die Leinwand läuft (M6), die Moderation hat volle Kontrolle (M7), alles ist unter Last getestet (M8). Mit M9 kommen automatische Löschung, Impressum und Datenschutzerklärung sowie das Produktiv-Setup mit Caddy und täglichen Sicherungen. **Inbetriebnahme:** mit Coolify nach [deploy/COOLIFY.md](deploy/COOLIFY.md), auf einem eigenen Server nach [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Voraussetzungen

- Node.js 24 (siehe `.nvmrc`)
- Docker (für Postgres und den S3-Emulator für Tests)

## Schnellstart

```bash
cp .env.example .env
npm install
npm run db:up      # Postgres (Port 54340) + S3-Emulator RustFS (Port 9040) in Docker
npm run db:seed    # Migrationen + Admin-Konto + Demo-Event „demo“
npm run dev        # Server :3000 + Web :5173
```

Dann <http://localhost:5173/admin> öffnen und mit dem Test-Admin aus `.env.example` anmelden. Unter <http://localhost:5173> zeigt eine Statusseite, ob API, Datenbank und Socket.IO laufen.

Ein Event ist für Teilnehmende erst erreichbar, wenn es im Admin-Bereich auf „Beitritt öffnen“ steht. Die Teilnahmeseite liegt unter `/e/<code>`.

Echte Handys im selben WLAN erreichen die App über die „Network“-Adresse, die Vite beim Start ausgibt. Ohne HTTPS geben Handy-Browser die Kamera nicht direkt frei; die App öffnet dann die Kamera-App des Handys.

Sind die Ports 3000 oder 5173 schon belegt, lassen sie sich ändern: `API_PORT=3100 WEB_PORT=5174 PUBLIC_BASE_URL=http://localhost:5174 npm run dev`.

## Projektstruktur

```
apps/
  server/   Fastify + Socket.IO + Drizzle (Postgres)
    src/db/schema.ts   Datenbankschema
    drizzle/           generierte SQL-Migrationen
  web/      React + Vite + Tailwind (Admin, Präsentation, Teilnehmende)
packages/
  shared/   gemeinsame Typen, Statuswerte, Zod-Schemas, Zeit-Sync
deploy/     Produktivbetrieb: Compose mit Caddy, Backups, Anleitungen (COOLIFY.md, DEPLOY.md)
docker-compose.coolify.yml   Deployment mit Coolify
```

## Skripte

| Befehl                                                                                    | Zweck                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                                             | Server und Web mit Hot Reload                                                                                                                                                                                                                                                                         |
| `npm run typecheck`                                                                       | TypeScript-Prüfung aller Workspaces                                                                                                                                                                                                                                                                   |
| `npm run lint` / `npm run format`                                                         | ESLint / Prettier                                                                                                                                                                                                                                                                                     |
| `npm test`                                                                                | Vitest in allen Workspaces                                                                                                                                                                                                                                                                            |
| `npm run build`                                                                           | Web-Frontend bauen                                                                                                                                                                                                                                                                                    |
| `npm run db:generate`                                                                     | Migration aus Änderungen an `schema.ts` erzeugen                                                                                                                                                                                                                                                      |
| `npm run db:migrate`                                                                      | Migrationen anwenden (passiert auch beim Serverstart)                                                                                                                                                                                                                                                 |
| `npm run db:seed`                                                                         | Admin-Konto und Demo-Event anlegen (mehrfach ausführbar)                                                                                                                                                                                                                                              |
| `npm run admin:create -w @comatch/server -- --email <adresse> [--reset]`                  | Admin-Konto anlegen oder Passwort neu setzen (zufällig, wird einmal angezeigt)                                                                                                                                                                                                                        |
| `npm run db:studio`                                                                       | Drizzle Studio (DB-Browser)                                                                                                                                                                                                                                                                           |
| `npm run simulate -w @comatch/server -- --people 100 --rounds 8`                          | Matching-Simulation: Übereinstimmung, Wiederholungen, Laufzeit je Runde                                                                                                                                                                                                                               |
| `npm run bots -w @comatch/server -- --event <code> --count 5 --url http://localhost:5173` | Simulierte Teilnehmende: treten bei, laden ein Selfie hoch, bestätigen ihr Match nach 8–40 s (`--confirm 8-40`); Codes echter Personen raten sie. Mit `--not-found 0.2` drückt ein Teil „Nicht gefunden“                                                                                              |
| `npm run loadtest -w @comatch/server -- --url http://localhost:3000 --count 200`          | Lasttest: legt ein Event an, lässt Bots beitreten und spielt Runden durch; misst Antwortzeiten, Latenz bis zum Match, Socket-Datenmenge und Event-Loop. `--flaky` simuliert schwaches WLAN (Verzögerung, Abbrüche), `--restart` wartet nach Runde 1 auf einen Server-Neustart. Braucht `SEED_ADMIN_*` |
| `docker compose --profile full up -d`                                                     | Produktions-Container + Postgres auf <http://localhost:3000>                                                                                                                                                                                                                                          |

## Technische Entscheidungen

- **npm-Workspaces** statt pnpm: kein zusätzliches Tool nötig.
- **Server ohne Build-Schritt:** Node 24 führt TypeScript direkt aus (Type Stripping). Deshalb gelten `erasableSyntaxOnly` (keine `enum`s) und Importe mit `.ts`-Endung.
- **TypeScript 6.0** statt 7: typescript-eslint unterstützt TypeScript 7 noch nicht.
- **Statuswerte** stehen einmal in `packages/shared/src/domain.ts` und werden für die Postgres-Enums wiederverwendet.
- Der Server-Port heißt **`API_PORT`** (nicht `PORT`), weil Tools wie die Vorschau `PORT` für den Vite-Server setzen.
- **Server-Tests** laufen gegen die eigene Datenbank `comatch_test` im selben Postgres-Container; sie wird automatisch angelegt und vor jedem Test geleert. Routen-Tests speichern Bilder im Arbeitsspeicher. Dieselben Speicher-Tests laufen auch gegen Postgres und gegen RustFS (S3).
- **Admin-Sessions** liegen in Postgres (Cookie `comatch_admin`, httpOnly, 14 Tage). Neue Admins kommen nur per Einladungslink dazu.
- **Logos** liegen klein (≤ 512 KB) direkt in Postgres.
- **Selfies** liegen in Postgres (Tabelle `media_object`, etwa 100 KB pro Foto, rund 10 MB pro Event mit 100 Personen). Optional in einem S3-Bucket, z. B. Hetzner Object Storage: Das geschieht, sobald `S3_ENDPOINT` gesetzt ist (lokal zum Ausprobieren RustFS, das MinIO-Image wird nicht mehr veröffentlicht). Das Handy schneidet das Foto auf 3:4 zu, verkleinert es auf 540×720 und kodiert es neu als JPEG (das entfernt auch den Aufnahmeort). Hochgeladen und ausgeliefert wird immer über den Server, ein Bucket bleibt also privat und braucht keine CORS-Regeln. Die tägliche Sicherung enthält die Fotos nicht.
- **Bilder ausliefern:** Selfies sind nur über signierte URLs erreichbar (`/api/media/…?exp=…&sig=…`, etwa 1 Stunde gültig). Ohne `MEDIA_SIGNING_SECRET` erzeugt der Server bei jedem Start ein neues Geheimnis, alte Links verfallen dann.
- **Teilnehmende** bekommen beim Beitritt ein Sitzungstoken. Es liegt im `localStorage` des Handys und wird als Bearer-Token gesendet; in der DB steht nur der Hash. Nach Neuladen oder gesperrtem Handy geht es dadurch an derselben Stelle weiter.
- **Code-Splitting:** Der Admin-Bereich ist ein eigener Chunk, damit Handys im Event-WLAN weniger laden.
- **Präsentationslink:** Das Token steht im Klartext in der DB, damit Admins den Link jederzeit wieder anzeigen können. Es erlaubt nur Lesezugriff und lässt sich neu erzeugen.
- **Matching-Engine** (`apps/server/src/matching`): reine Funktionen ohne Datenbank und Zeitgeber, deterministisch über einen Seed.
  - Übereinstimmung gewichtet und auf 0–1 normalisiert. Im Modus „ergänzend“ ohne Zuordnung passt jede andere Antwort; sobald eine Frage Zuordnungen hat, zählen nur die.
  - Wiederholte Paare kosten so viel, dass sie nur entstehen, wenn es nicht anders geht; dann das Paar, dessen Treffen am längsten her ist.
  - Bis 13 Personen werden alle Aufteilungen exakt durchgerechnet (höchstens ca. 50 ms). Darüber: greedy, dann Paartausch, gezielter Dreifach-Tausch bei Wiederholungen und Tausch mit der Dreiergruppe (100 Personen: ca. 5 ms).
  - Pool: Wartende werden sofort miteinander gepaart (ohne Wiederholungen). Wer allein bleibt, kommt nach der Wartezeit als Dritte in ein offenes Match. Weniger als 60 s vor Rundenende wird niemand mehr gematcht.
- **Live-Betrieb** (`apps/server/src/live`): Postgres bleibt die Quelle der Wahrheit, im Speicher liegen nur Timer und offene Verbindungen. Alle Änderungen an einem Event laufen nacheinander durch eine Warteschlange. Nach einem Neustart werden laufende Runden aus `round_ends_at` fortgesetzt.
  - Jede Änderung schickt jedem Handy seinen vollständigen Zustand („Snapshot statt Delta“); Leinwand und Admins bekommen Zähler und Rundentakt. Countdowns rechnen mit dem gemessenen Uhren-Offset.
  - Pool-Matcher alle 3 s während einer Runde. Wer länger als 60 s keine Verbindung hatte, wird zum Rundenwechsel inaktiv und kommt beim Wiederverbinden zurück in den Pool.
  - Verlässt jemand ein Match (Austritt), kommt das Gegenüber ohne Wartezeit zurück in den Pool. Im Pool kommt niemand zu jemandem, den die Person schon getroffen hat.
  - Beim Herunterfahren schließt der Server nur die Transporte, damit sich Clients nach einem Neustart selbst neu verbinden. Clients verbinden sich auch nach einer Trennung durch den Server neu, außer ihre Sitzung wurde abgelehnt.
  - Uhr und Timer sind austauschbar (`createManualClock`), dadurch laufen Rundenwechsel in den Tests ohne Warten.
- **Leinwand** (`apps/web/src/pages/present`, Link aus der Moderation unter „QR-Code & Links“):
  - Läuft ohne Login mit dem Presenter-Token aus dem Link. `GET /api/present/:eventId?token=…` liefert Titel, Logo, Farbe und Beitrittslink; alles Weitere kommt per Socket.IO im selben Zustand wie für Admins.
  - Der Zustand enthält zusätzlich die Summen über alle Runden, die bestätigten Matches der laufenden Runde mit Selfies (höchstens 30) und Selfies für Lobby (die 24 neuesten) und Abschluss (alle). Während der Runden gehen keine Selfie-Listen mit.
  - Animationen: Die Leinwand spielt jedes Match ab, dessen ID sie noch nicht kennt („Snapshot statt Delta“, kein eigenes Ereignis). Beim Öffnen oder Neuladen wird nichts nachgespielt. Bei vielen Bestätigungen kommen bis zu drei Matches gleichzeitig auf die Bühne. Konfetti per `canvas-confetti`; mit „Bewegung reduzieren“ nur Ein- und Ausblenden.
  - Größen in `vh`/`vw`, damit die Ansicht auf jedem Beamer gleich aussieht; Countdown in den letzten 10 s betont. Die Abschlusscollage berechnet die Kachelgröße so, dass alle Selfies ohne Scrollen passen.
- **Sprache je Event** (`apps/web/src/i18n`): Deutsch oder Englisch, gewählt beim Anlegen und in den Einstellungen (Spalte `event.language`). Danach richten sich Handy-Seiten, Leinwand und die verlinkten Rechtstexte; die Admin-Oberfläche bleibt Deutsch. Fragen und Antworten übersetzen Admins selbst, nur die Beispielfragen gibt es in beiden Sprachen.
  - Texte stehen in `de.ts` und `en.ts`; `en.ts` hat den Typ von `de.ts`, fehlende Übersetzungen fallen also beim Typecheck auf.
  - Der Server schickt weiter deutsche Fehlermeldungen. Das Handy übersetzt sie über den Fehlercode (`errorText`); unbekannte Codes bekommen auf Englisch eine allgemeine Meldung.
  - Solange das Event noch nicht geladen ist (oder nicht existiert), gilt die Browsersprache. Eine geänderte Sprache sehen offene Seiten erst nach dem Neuladen.
- **Moderation** (`apps/server/src/events/report.ts`, Tabs „Teilnehmende“ und „Statistik“):
  - „+1 Minute“ verlängert die laufende Runde (auch in der Pause).
  - Teilnehmende sind anonym und nach Beitritt nummeriert (T001 …). „Selfie zurücksetzen“ löscht das Foto, das Handy springt zum Selfie-Schritt mit Hinweis. „Entfernen“ löscht das Foto und beendet die Sitzung („Die Moderation hat dich aus dem Event entfernt“); die Person bleibt mit Status `removed` und ihren Antworten in der Datenbank, damit Statistik und Nummern stimmen. In beiden Fällen lösen sich offene Matches auf, das Gegenüber kommt sofort in den Pool.
  - Statistik: bestätigte Matches, Bestätigungsquote (bestätigt ÷ abgeschlossen, ohne noch offene), Matches pro Person (Ø, Median, Verteilung), je Runde und für Nachzügler.
  - CSV-Export (Matches, Teilnehmende) mit Semikolon und BOM für Excel, Zeiten in Europe/Berlin, ohne Fotos. Werte, die mit `=`, `+`, `-` oder `@` beginnen, werden entschärft.
- **Bestätigung** (`apps/server/src/live/codes.ts`, `confirm.ts`):
  - Codes sind dreistellige Zahlen mit verschiedenen Ziffern ohne führende Null. Emoji + Wort (Plan, offene Frage) ist bewusst noch nicht gebaut; das Format steckt nur in `codes.ts`.
  - Zur Auswahl stehen der richtige Code und zwei Köder: einer mit vertauschten Ziffern, einer mit einer anderen Ziffer. Köder sind gespeichert und die Reihenfolge ist stabil, damit Neuladen nichts verrät; nach jeder falschen Wahl wird neu gemischt.
  - Falsche Wahl: 5 s Sperre (serverseitig). Nach 3 Fehlversuchen gibt es keine Auswahl mehr, nur noch die Eingabe des Codes.
  - Paare bestätigen sich gegenseitig, Dreiergruppen im Ring A→B→C→A. Kommt jemand dazu oder geht, behält jede Person ihren Code; wer dieselbe Person bestätigen muss wie vorher, behält auch ihren Stand.
  - Bestätigt heißt: Pause bis Rundenende, kein weiteres Match in dieser Runde.
  - „Nicht gefunden“ geht ab Rundenmitte und frühestens 1 min nach Beginn des Matches, nicht mehr nach der eigenen Bestätigung. Ein Paar löst sich auf, in einer Dreiergruppe suchen die anderen beiden weiter. Wer frei wird, kommt sofort in den Pool; bleibt weniger als 1 min, geht es in der nächsten Runde weiter.
  - Code wählen und „Nicht gefunden“ laufen über REST (`POST /api/participant/match/confirm` und `/not-found`) statt über Socket-Nachrichten wie im Plan: So gibt es klare Fehlercodes und das Rate-Limit greift. Die Antwort enthält den neuen Zustand; alle anderen bekommen ihn per Socket.
  - Gemeinsamkeiten berechnet der Server je Paar aus den passenden Fragen. Das Handy sieht nur diese, nicht alle Antworten des Gegenübers.

## Datenschutz und Betrieb (M9)

- **Löschfristen** (`apps/server/src/events/retention.ts`): Selfies und Sitzungen werden `RETENTION_HOURS` (Standard 24) nach Eventende gelöscht; geprüft beim Start und alle 10 Minuten. Antworten und Matches bleiben für die Statistik, ohne Foto und Sitzung sind sie keiner Person mehr zuzuordnen. Events, die eine Woche ohne Aktivität offen stehen, werden automatisch beendet. Admins können die Fotos eines beendeten Events auch sofort löschen.
- **Impressum und Datenschutzerklärung** unter `/impressum` und `/datenschutz`, auf Englisch unter `/imprint` und `/privacy` (Übersetzung, ebenfalls vor dem Einsatz prüfen lassen), Betreiber-Angaben aus `LEGAL_*` (`GET /api/legal`). Der Text der Datenschutzerklärung ist ein Entwurf, der das tatsächliche Verhalten der App beschreibt; vor dem Launch mit der Datenschutzberatung abstimmen. Die Einwilligung beim Selfie nennt die Löschfrist und verlinkt die Erklärung.
- **Logs** enthalten keine IP-Adressen und keine Query-Strings (dort stünden Presenter-Token und Bild-Signaturen); der Health-Check wird nicht geloggt.
- **Sicherheits-Header** setzt die App selbst (`apps/server/src/lib/security-headers.ts`), damit sie hinter jedem Proxy gelten: strenge Content-Security-Policy (alles vom eigenen Server; Inline-Styles erlaubt, die React für dynamische Farben braucht), HSTS unter HTTPS.
- **Coolify** (`docker-compose.coolify.yml`, [deploy/COOLIFY.md](deploy/COOLIFY.md)): Build Pack „Docker Compose“ mit App, Postgres und Backup. HTTPS und Routing kommen von Coolify, Passwörter und Adresse aus den `SERVICE_*`-Variablen, Pflichtangaben blockieren das Deployment, bis sie ausgefüllt sind.
- **Produktiv-Setup ohne Coolify** (`deploy/`): Caddy mit automatischem HTTPS. App und Postgres sind nur intern erreichbar; `TRUST_PROXY` ist nur dort an. Logs aller Dienste auf 5 × 10 MB begrenzt. Der Dienst `backup` sichert die Datenbank täglich mit 7 Tagen Aufbewahrung; `deploy/restore.sh` stellt wieder her.
- Lokal geprüft: kompletter Produktions-Stack mit Caddy, Beitritt mit Selfie, Leinwand mit Match-Animation unter der CSP ohne Konsolenfehler, Admin-Konto per Befehl, Login über HTTPS, Sicherung und Wiederherstellung.

## Lasttest (M8)

Gemessen auf einem Entwicklungsrechner (Apple Silicon), Server als einzelner Node-Prozess im Produktionsmodus, Postgres und S3-Emulator in Docker. Bots bestätigen 5–40 s nach dem Match, 5 % drücken „Nicht gefunden“. Ziel laut Plan: 150–200 Clients bei bis zu 100 Teilnehmenden.

| Szenario                                                                 | Ergebnis                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200 Bots, 3 Runden                                                       | Beitritt aller 200 in 1,9 s (Beitritt + Selfie p95 0,27 s). Match auf allen Handys 0,2 s nach Rundenstart (max 0,24 s). Bestätigen p50 54 ms, p95 83 ms. Event-Loop p99 ≤ 27 ms. Keine Fehler.                                                 |
| Schwaches WLAN (`--flaky`: 200–800 ms je Paket, 345 Verbindungsabbrüche) | Alle 200 Handys bekommen in jeder Runde ihr Match (p50 0,7 s, max 11 s bei gerade getrennten). 307 automatische Wiederverbindungen. 6 abgebrochene Anfragen; die Person sieht „Keine Verbindung“ und tippt erneut (Bestätigen ist idempotent). |
| Server-Neustart mitten in der Runde                                      | Server ~6 s weg; alle 200 Bots nach spätestens 4,8 s wieder verbunden, die Runde läuft mit derselben Endzeit weiter.                                                                                                                           |
| Postgres 10 s gestoppt                                                   | Server bleibt stabil; Anfragen in der Zeit warten oder enden mit 500, danach läuft alles weiter; die nächste Runde startet normal.                                                                                                             |

Gefunden und behoben:

- **Rate-Limits je IP** hätten im Event-WLAN (alle Handys hinter einer Adresse) nach 60 Selfies bzw. Bestätigungen pro Minute blockiert; im ersten Lauf kamen nur 60 von 200 Bots ins Event. Jetzt: Teilnehmenden-Endpunkte je Person (Selfie 10/min, Code 30/min, „Nicht gefunden“ 10/min), Beitritt 600/min je IP. Die 429-Antwort ist deutsch (`rate_limited`).
- **Zustand nur bei Änderung senden:** Vorher bekam bei jeder Bestätigung jedes Handy seinen vollen Zustand (132.000 Nachrichten, 115 MB in 3 Runden). Jetzt nur noch, wenn sich der Zustand eines Handys geändert hat: 15.700 Nachrichten, 4,6 MB.
- **Absturzgefahr:** Ein scheiterndes Trennen (z. B. DB kurz weg) war ein unbehandeltes Promise und hätte Node beendet. Jetzt abgefangen und geloggt.
- **Stehende Runde:** Scheiterte ein Rundenwechsel einmal, blieb das Event stehen. Jetzt neuer Versuch nach 5 s.
- **Hängende Anfragen am Handy:** Anfragen brechen nach 20 s ab (Uploads 60 s) mit klarer Meldung.
- **Docker:** `restart: unless-stopped` und 15 s Zeit zum sauberen Herunterfahren.
- `/api/health` meldet jetzt Event-Loop-Verzögerung und Speicher (für Lasttest und Betrieb).

Offen: Gerätetests auf echten Handys (iOS Safari, Android Chrome: Kamera, Wake Lock, Wiederverbinden aus dem Hintergrund) und ein Test am echten Beamer. Der Speicherbedarf liegt bei 250–400 MB und wächst über die Läufe nicht.
