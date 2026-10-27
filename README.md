# CoMatch

Live-Matchmaking für Gründer*innen auf Präsenzveranstaltungen. Gesamtplan und Entscheidungen: [PLAN.md](PLAN.md).

**Stand:** M1 (Moderationsansicht) fertig: Admin-Login, Team-Einladungen, Event-Verwaltung, Fragen-Editor, Branding, QR-Code. Präsentation und Teilnahme sind noch Platzhalter.

## Voraussetzungen

- Node.js 24 (siehe `.nvmrc`)
- Docker (für Postgres)

## Schnellstart

```bash
cp .env.example .env
npm install
npm run db:up      # Postgres in Docker (Host-Port 54340)
npm run db:seed    # Migrationen + Admin-Konto + Demo-Event „demo“
npm run dev        # Server :3000 + Web :5173
```

Dann <http://localhost:5173/admin> öffnen und mit dem Test-Admin aus `.env.example` anmelden. Unter <http://localhost:5173> zeigt eine Statusseite, ob API, Datenbank und Socket.IO laufen.

Echte Handys im selben WLAN erreichen die App über die „Network“-Adresse, die Vite beim Start ausgibt.

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

| Befehl                                | Zweck                                                        |
| ------------------------------------- | ------------------------------------------------------------ |
| `npm run dev`                         | Server und Web mit Hot Reload                                |
| `npm run typecheck`                   | TypeScript-Prüfung aller Workspaces                          |
| `npm run lint` / `npm run format`     | ESLint / Prettier                                            |
| `npm test`                            | Vitest in allen Workspaces                                   |
| `npm run build`                       | Web-Frontend bauen                                           |
| `npm run db:generate`                 | Migration aus Änderungen an `schema.ts` erzeugen             |
| `npm run db:migrate`                  | Migrationen anwenden (passiert auch beim Serverstart)        |
| `npm run db:seed`                     | Admin-Konto und Demo-Event anlegen (mehrfach ausführbar)     |
| `npm run db:studio`                   | Drizzle Studio (DB-Browser)                                  |
| `docker compose --profile full up -d` | Produktions-Container + Postgres auf <http://localhost:3000> |

## Technische Entscheidungen

- **npm-Workspaces** statt pnpm: kein zusätzliches Tool nötig.
- **Server ohne Build-Schritt:** Node 24 führt TypeScript direkt aus (Type Stripping). Deshalb gelten `erasableSyntaxOnly` (keine `enum`s) und Importe mit `.ts`-Endung.
- **TypeScript 6.0** statt 7: typescript-eslint unterstützt TypeScript 7 noch nicht.
- **Statuswerte** stehen einmal in `packages/shared/src/domain.ts` und werden für die Postgres-Enums wiederverwendet.
- Der Server-Port heißt **`API_PORT`** (nicht `PORT`), weil Tools wie die Vorschau `PORT` für den Vite-Server setzen.
- **Server-Tests** laufen gegen die eigene Datenbank `comatch_test` im selben Postgres-Container; sie wird automatisch angelegt und vor jedem Test geleert.
- **Admin-Sessions** liegen in Postgres (Cookie `comatch_admin`, httpOnly, 14 Tage). Neue Admins kommen nur per Einladungslink dazu.
- **Logos** liegen klein (≤ 512 KB) direkt in Postgres. Der S3-Speicher für Selfies kommt mit M2 (lokal ein S3-Emulator, in Produktion Hetzner Object Storage).
- **Präsentationslink:** Das Token steht im Klartext in der DB, damit Admins den Link jederzeit wieder anzeigen können. Es erlaubt nur Lesezugriff und lässt sich neu erzeugen.
