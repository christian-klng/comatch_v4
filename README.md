# CoMatch

Live-Matchmaking für Gründer*innen auf Präsenzveranstaltungen. Gesamtplan und Entscheidungen: [PLAN.md](PLAN.md).

**Stand:** M5 fertig. Admins konfigurieren Events (M1), Teilnehmende treten per QR-Code bei (M2), die Matching-Engine paart (M3), die Runden laufen automatisch und live per Socket.IO (M4). Jetzt ist der Spielablauf am Handy komplett: Selfie des Gegenübers mit Gemeinsamkeiten, gegenseitige Bestätigung per Code mit Ködern, Fehlversuche und „Nicht gefunden“ (M5). Die Leinwand (M6) folgt.

## Voraussetzungen

- Node.js 24 (siehe `.nvmrc`)
- Docker (für Postgres und den S3-Emulator)

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
```

## Skripte

| Befehl                                                                                    | Zweck                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                                             | Server und Web mit Hot Reload                                                                                                                                                                            |
| `npm run typecheck`                                                                       | TypeScript-Prüfung aller Workspaces                                                                                                                                                                      |
| `npm run lint` / `npm run format`                                                         | ESLint / Prettier                                                                                                                                                                                        |
| `npm test`                                                                                | Vitest in allen Workspaces                                                                                                                                                                               |
| `npm run build`                                                                           | Web-Frontend bauen                                                                                                                                                                                       |
| `npm run db:generate`                                                                     | Migration aus Änderungen an `schema.ts` erzeugen                                                                                                                                                         |
| `npm run db:migrate`                                                                      | Migrationen anwenden (passiert auch beim Serverstart)                                                                                                                                                    |
| `npm run db:seed`                                                                         | Admin-Konto und Demo-Event anlegen (mehrfach ausführbar)                                                                                                                                                 |
| `npm run db:studio`                                                                       | Drizzle Studio (DB-Browser)                                                                                                                                                                              |
| `npm run simulate -w @comatch/server -- --people 100 --rounds 8`                          | Matching-Simulation: Übereinstimmung, Wiederholungen, Laufzeit je Runde                                                                                                                                  |
| `npm run bots -w @comatch/server -- --event <code> --count 5 --url http://localhost:5173` | Simulierte Teilnehmende: treten bei, laden ein Selfie hoch, bestätigen ihr Match nach 8–40 s (`--confirm 8-40`); Codes echter Personen raten sie. Mit `--not-found 0.2` drückt ein Teil „Nicht gefunden“ |
| `docker compose --profile full up -d`                                                     | Produktions-Container + Postgres + S3 auf <http://localhost:3000>                                                                                                                                        |

## Technische Entscheidungen

- **npm-Workspaces** statt pnpm: kein zusätzliches Tool nötig.
- **Server ohne Build-Schritt:** Node 24 führt TypeScript direkt aus (Type Stripping). Deshalb gelten `erasableSyntaxOnly` (keine `enum`s) und Importe mit `.ts`-Endung.
- **TypeScript 6.0** statt 7: typescript-eslint unterstützt TypeScript 7 noch nicht.
- **Statuswerte** stehen einmal in `packages/shared/src/domain.ts` und werden für die Postgres-Enums wiederverwendet.
- Der Server-Port heißt **`API_PORT`** (nicht `PORT`), weil Tools wie die Vorschau `PORT` für den Vite-Server setzen.
- **Server-Tests** laufen gegen die eigene Datenbank `comatch_test` im selben Postgres-Container; sie wird automatisch angelegt und vor jedem Test geleert. Routen-Tests speichern Bilder im Arbeitsspeicher, ein eigener Test prüft den S3-Speicher gegen RustFS.
- **Admin-Sessions** liegen in Postgres (Cookie `comatch_admin`, httpOnly, 14 Tage). Neue Admins kommen nur per Einladungslink dazu.
- **Logos** liegen klein (≤ 512 KB) direkt in Postgres.
- **Selfies** liegen in einem S3-Bucket: lokal in RustFS (das MinIO-Image wird nicht mehr veröffentlicht), in Produktion in Hetzner Object Storage. Das Handy schneidet das Foto auf 3:4 zu, verkleinert es auf 540×720 und kodiert es neu als JPEG (das entfernt auch den Aufnahmeort). Hochgeladen wird über den Server, nicht direkt in den Bucket. So bleibt der Bucket privat und braucht keine CORS-Regeln.
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
- **Bestätigung** (`apps/server/src/live/codes.ts`, `confirm.ts`):
  - Codes sind dreistellige Zahlen mit verschiedenen Ziffern ohne führende Null. Emoji + Wort (Plan, offene Frage) ist bewusst noch nicht gebaut; das Format steckt nur in `codes.ts`.
  - Zur Auswahl stehen der richtige Code und zwei Köder: einer mit vertauschten Ziffern, einer mit einer anderen Ziffer. Köder sind gespeichert und die Reihenfolge ist stabil, damit Neuladen nichts verrät; nach jeder falschen Wahl wird neu gemischt.
  - Falsche Wahl: 5 s Sperre (serverseitig). Nach 3 Fehlversuchen gibt es keine Auswahl mehr, nur noch die Eingabe des Codes.
  - Paare bestätigen sich gegenseitig, Dreiergruppen im Ring A→B→C→A. Kommt jemand dazu oder geht, behält jede Person ihren Code; wer dieselbe Person bestätigen muss wie vorher, behält auch ihren Stand.
  - Bestätigt heißt: Pause bis Rundenende, kein weiteres Match in dieser Runde.
  - „Nicht gefunden“ geht ab Rundenmitte und frühestens 1 min nach Beginn des Matches, nicht mehr nach der eigenen Bestätigung. Ein Paar löst sich auf, in einer Dreiergruppe suchen die anderen beiden weiter. Wer frei wird, kommt sofort in den Pool; bleibt weniger als 1 min, geht es in der nächsten Runde weiter.
  - Code wählen und „Nicht gefunden“ laufen über REST (`POST /api/participant/match/confirm` und `/not-found`) statt über Socket-Nachrichten wie im Plan: So gibt es klare Fehlercodes und das Rate-Limit greift. Die Antwort enthält den neuen Zustand; alle anderen bekommen ihn per Socket.
  - Gemeinsamkeiten berechnet der Server je Paar aus den passenden Fragen. Das Handy sieht nur diese, nicht alle Antworten des Gegenübers.
