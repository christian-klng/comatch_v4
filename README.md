# CoMatch

Live-Matchmaking für Gründer*innen auf Präsenzveranstaltungen. Gesamtplan und Entscheidungen: [PLAN.md](PLAN.md).

**Stand:** Meilenstein M0 (Projektsetup). Die Ansichten sind noch Platzhalter.

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

Dann <http://localhost:5173> öffnen. Die Dev-Statusseite zeigt, ob API, Datenbank und Socket.IO laufen.

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
- **Ein S3-Speicher für Selfies** kommt mit M2 dazu (lokal ein S3-Emulator, in Produktion Hetzner Object Storage).
