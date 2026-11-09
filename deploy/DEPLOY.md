# CoMatch in Betrieb nehmen (Hetzner)

Diese Anleitung gilt für einen eigenen Server ohne Plattform. Mit Coolify: siehe [COOLIFY.md](COOLIFY.md).

Ein Server reicht für Events bis 100 Teilnehmende mit großem Puffer (Lasttest: 200 Clients, siehe README). Alles läuft per Docker Compose: Caddy (HTTPS), App, Postgres und ein Backup-Dienst. Selfies liegen in der Datenbank.

## 1. Einmalig vorbereiten

**Verträge und Konten**

- [ ] Hetzner-Konto, Projekt in der Cloud Console anlegen.
- [ ] **Auftragsverarbeitungsvertrag (AVV)** mit Hetzner abschließen: Cloud Console → Konto → „Verträge“ / „Auftragsverarbeitung“. Ohne AVV kein Produktivbetrieb (Art. 28 DSGVO).
- [ ] Datenschutzerklärung (`/datenschutz`) mit der Datenschutzberatung abstimmen. Der Text in `apps/web/src/pages/legal/LegalPages.tsx` ist ein Entwurf, der zum Verhalten der App passt.

**Server**

- [ ] Cloud-Server anlegen: Standort **Falkenstein oder Nürnberg**, Typ **CX22** (2 vCPU, 4 GB) reicht, Image **Ubuntu 24.04**, eigenen SSH-Key hinterlegen.
- [ ] Firewall in der Cloud Console: eingehend nur 22 (SSH), 80 und 443 (TCP) sowie 443 (UDP, HTTP/3).
- [ ] Docker installieren:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- [ ] Optional, empfohlen: Hetzner-Backups für den Server aktivieren (tägliche Snapshots, 7 Stück) als zweite Sicherung.

**Domain**

- [ ] DNS: A-Eintrag (und AAAA für IPv6) der Domain, z. B. `match.example.de`, auf die Server-IP. Caddy holt das Zertifikat beim ersten Start automatisch.

**Optional: Object Storage**

Nur wenn die Selfies nicht in der Datenbank liegen sollen: In der Cloud Console unter Object Storage einen Bucket anlegen (Standort wie der Server, Sichtbarkeit **privat**), Zugangsschlüssel erzeugen und die Werte `S3_*` in `deploy/.env` ausfüllen. Endpunkt z. B. `https://fsn1.your-objectstorage.com`.

## 2. Installieren

```bash
git clone <repo-url> comatch && cd comatch
cp deploy/env.example deploy/.env && chmod 600 deploy/.env
nano deploy/.env   # DOMAIN, Passwörter, LEGAL_* ausfüllen
```

Zufällige Werte für `POSTGRES_PASSWORD` und `MEDIA_SIGNING_SECRET`:

```bash
openssl rand -base64 32
```

Starten (baut das Image auf dem Server):

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Prüfen:

```bash
curl -s https://match.example.de/api/health
```

Erwartet: `"status":"ok"`. Die Seiten `/impressum` und `/datenschutz` müssen die Angaben aus `LEGAL_*` zeigen; fehlen sie, erscheint ein gelber Hinweis und die App warnt im Log.

Erstes Admin-Konto anlegen (das Passwort wird einmal angezeigt, im Passwort-Manager speichern):

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec app \
  node apps/server/src/db/create-admin.ts --email du@example.de
```

Weitere Admins lädt man danach in der Moderation unter „Team“ ein. Passwort vergessen: denselben Befehl mit `--reset` ausführen (meldet alle Sitzungen des Kontos ab).

## 3. Betrieb

Kurzform für die Befehle unten:

```bash
alias dc='docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env'
```

| Aufgabe             | Befehl                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| Status              | `dc ps`                                                                            |
| Logs der App        | `dc logs -f app`                                                                   |
| Update einspielen   | `git pull && dc up -d --build` (Migrationen laufen beim Start automatisch)         |
| Neustart            | `dc restart app` (laufende Runden laufen weiter, Handys verbinden sich selbst neu) |
| Sicherungen ansehen | `dc exec backup ls -lh /backups`                                                   |
| Sicherung sofort    | `dc exec backup pg_dump --format=custom --no-owner --file=/backups/manuell.dump`   |

**Nicht während eines laufenden Events aktualisieren**, wenn es sich vermeiden lässt. Ein Neustart ist zwar erprobt (alle Handys nach ~5 s wieder da), kostet aber ein paar Sekunden.

### Sicherungen

- Der Dienst `backup` sichert die Datenbank täglich (`pg_dump`) ins Volume `backups` und behält 7 Tage. Fotos sind nicht in der Sicherung (Tabelle `media_object` ohne Inhalt), damit sie nicht länger als die Löschfrist aufbewahrt werden. Nach einer Wiederherstellung fehlen deshalb die Selfies laufender Events.
- Die Sicherungen liegen auf demselben Server. Für eine Kopie außerhalb: Hetzner-Server-Backups aktivieren (siehe oben) oder die Dateien regelmäßig auf eine Storage Box kopieren. Auch dort höchstens 7 Tage aufbewahren, so steht es in der Datenschutzerklärung.

Wiederherstellen (überschreibt die aktuelle Datenbank):

```bash
dc stop app
deploy/restore.sh comatch-20261101-030000.dump
dc start app
```

### Löschfristen

- Selfies und Sitzungen werden `RETENTION_HOURS` (Standard 24) nach Eventende automatisch gelöscht; die App prüft alle 10 Minuten. In der Moderation steht beim beendeten Event, wann; dort lassen sich die Fotos auch sofort löschen.
- Events, die eine Woche ohne Aktivität offen stehen, beendet die App selbst, damit keine Fotos liegen bleiben.
- Logs enthalten keine IP-Adressen und keine Tokens; Docker überschreibt sie nach 5 × 10 MB je Dienst.

### Überwachung

`/api/health` meldet Datenbank, Event-Loop-Verzögerung und Speicher. Ein externer Uptime-Check (z. B. alle 1–5 Minuten) auf diese Adresse genügt. Gute Werte unter Last: `eventLoop.p99Ms` unter 50.

## 4. Probe-Event vor dem ersten echten Einsatz

- [ ] Event in der Moderation anlegen, Fragen und Branding einstellen, Beitritt öffnen.
- [ ] Präsentationslink (Tab „QR-Code & Links“) auf dem Rechner am Beamer öffnen, Vollbild, Bildschirmschoner aus. Aus 3–10 m Abstand prüfen: QR-Code scanbar, Countdown lesbar.
- [ ] Mit echten Handys beitreten: mindestens **iOS Safari** und **Android Chrome**. Kamera, Selfie, Einwilligung, Match, Code bestätigen, „Nicht gefunden“, Pause, Ende.
- [ ] Handy sperren und nach 30 s entsperren: Die Seite muss sich selbst wieder verbinden.
- [ ] Im WLAN des Veranstaltungsorts testen (viele Geräte hinter einer IP, evtl. geblockte WebSockets; Socket.IO fällt dann auf Long-Polling zurück).
- [ ] Optional Last vom eigenen Rechner gegen den Server (nicht während eines echten Events):
  ```bash
  SEED_ADMIN_EMAIL=du@example.de SEED_ADMIN_PASSWORD=… npm run loadtest -w @comatch/server -- --url https://match.example.de --count 150
  ```
  Legt ein Event „Lasttest …“ an; danach in der Moderation löschen.
- [ ] Nach dem Probe-Event: Event beenden, in der Moderation „Fotos jetzt löschen“, Statistik und CSV-Export ansehen.
