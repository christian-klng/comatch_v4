# CoMatch

Live-Matchmaking für Gründer*innen auf Präsenzveranstaltungen. Gesamtplan und Entscheidungen: [PLAN.md](PLAN.md).

**Stand:** M3 fertig. Admins konfigurieren Events (M1). Teilnehmende treten per QR-Code bei, beantworten drei Fragen, machen ein Selfie und warten danach im Pool (M2). Die Matching-Engine paart Runden und Nachzügler, ist aber noch nicht an Datenbank und Rundentakt angeschlossen (M3). Das folgt mit M4.

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

| Befehl                                                           | Zweck                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                                                    | Server und Web mit Hot Reload                                           |
| `npm run typecheck`                                              | TypeScript-Prüfung aller Workspaces                                     |
| `npm run lint` / `npm run format`                                | ESLint / Prettier                                                       |
| `npm test`                                                       | Vitest in allen Workspaces                                              |
| `npm run build`                                                  | Web-Frontend bauen                                                      |
| `npm run db:generate`                                            | Migration aus Änderungen an `schema.ts` erzeugen                        |
| `npm run db:migrate`                                             | Migrationen anwenden (passiert auch beim Serverstart)                   |
| `npm run db:seed`                                                | Admin-Konto und Demo-Event anlegen (mehrfach ausführbar)                |
| `npm run db:studio`                                              | Drizzle Studio (DB-Browser)                                             |
| `npm run simulate -w @comatch/server -- --people 100 --rounds 8` | Matching-Simulation: Übereinstimmung, Wiederholungen, Laufzeit je Runde |
| `docker compose --profile full up -d`                            | Produktions-Container + Postgres + S3 auf <http://localhost:3000>       |

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
