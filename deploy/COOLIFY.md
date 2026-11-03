# CoMatch mit Coolify betreiben

Coolify baut die App aus dem Git-Repository, stellt HTTPS und das Routing bereit und erzeugt die Passwörter selbst. Grundlage ist [docker-compose.coolify.yml](../docker-compose.coolify.yml) mit drei Diensten: App, Postgres und Backup. Selfies liegen in einem S3-Speicher außerhalb von Coolify.

Ohne Coolify: siehe [DEPLOY.md](DEPLOY.md). Das Probe-Event dort gilt für beide Wege.

## 1. Vorbereiten

- [ ] **Server** in Coolify eingerichtet, mit laufendem Proxy (Traefik oder Caddy). Für CoMatch reichen 2 vCPU und 4 GB, der Build braucht kurz mehr Speicher.
- [ ] **Domain:** DNS-A-Eintrag (und AAAA für IPv6), z. B. `match.example.de`, zeigt auf den Coolify-Server.
- [ ] **S3-Speicher:** Bucket anlegen (privat) und Zugangsschlüssel erzeugen. Bei Hetzner Object Storage: Cloud Console → Object Storage, Endpunkt z. B. `https://fsn1.your-objectstorage.com`.
- [ ] **AV-Verträge:** mit dem Hoster von Server und Speicher (Art. 28 DSGVO). Nutzt du Coolify Cloud statt einer eigenen Instanz, prüfe das auch dafür: Dort liegen deine Zugangsdaten.
- [ ] **Datenschutzerklärung** mit der Datenschutzberatung abstimmen. Sie nennt Hetzner als Hoster; bei einem anderen Anbieter `apps/web/src/pages/legal/LegalPages.tsx` anpassen.

## 2. Anwendung anlegen

1. Im Projekt **+ New** und das Repository wählen. Für ein privates Repository vorher die GitHub App unter **Sources** verbinden.
2. Branch `main`, Build Pack **Docker Compose**.
3. **Base Directory:** `/`
4. **Docker Compose Location:** `/docker-compose.coolify.yml`
5. Speichern. Unter **Docker Compose Content** müssen `app`, `postgres` und `backup` erscheinen.

## 3. Domain setzen

Unter **Domains** für den Dienst **app** eintragen, **mit Port 3000**:

```text
https://match.example.de:3000
```

Der Port sagt dem Proxy nur, wohin er intern weiterleitet. Nach außen bleibt die Adresse `https://match.example.de`. Für `postgres` und `backup` keine Domain eintragen.

## 4. Variablen ausfüllen

Unter **Environment Variables**. Diese Werte erzeugt Coolify selbst, bitte nicht von Hand setzen:

| Variable                    | Zweck                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `SERVICE_URL_APP`           | Adresse der App, aus der Domain abgeleitet                                            |
| `SERVICE_PASSWORD_POSTGRES` | Datenbank-Passwort. Nach dem ersten Start nicht mehr ändern, Postgres behält das alte |
| `SERVICE_PASSWORD_64_MEDIA` | Schlüssel für signierte Bild-Links                                                    |

Diese Werte trägst du ein. Ohne die Pflichtfelder startet Coolify das Deployment nicht:

| Variable               | Pflicht | Beispiel                                              |
| ---------------------- | ------- | ----------------------------------------------------- |
| `S3_ENDPOINT`          | ja      | `https://fsn1.your-objectstorage.com`                 |
| `S3_BUCKET`            | ja      | `comatch-selfies`                                     |
| `S3_ACCESS_KEY_ID`     | ja      |                                                       |
| `S3_SECRET_ACCESS_KEY` | ja      |                                                       |
| `S3_REGION`            | nein    | `fsn1` (Standard)                                     |
| `LEGAL_NAME`           | ja      | `Beispiel Events GmbH`                                |
| `LEGAL_ADDRESS`        | ja      | `Musterstraße 1, 10115 Berlin`                        |
| `LEGAL_EMAIL`          | ja      | `kontakt@example.de`                                  |
| `LEGAL_PHONE`          | nein    |                                                       |
| `LEGAL_DPO`            | nein    | Name und Kontakt der oder des Datenschutzbeauftragten |
| `RETENTION_HOURS`      | nein    | `24` (Standard)                                       |

## 5. Deployen und prüfen

**Deploy** klicken, der erste Build dauert einige Minuten. Danach müssen alle drei Dienste als gesund (healthy) erscheinen.

- `https://match.example.de/api/health` meldet `"status":"ok"`.
- `/impressum` und `/datenschutz` zeigen deine Angaben.

**Erstes Admin-Konto:** Unter **Terminal** den Container `app` wählen und ausführen:

```bash
node apps/server/src/db/create-admin.ts --email du@example.de
```

Das Passwort erscheint einmal, also im Passwort-Manager speichern. Weitere Admins lädst du unter „Team“ ein. Passwort vergessen: derselbe Befehl mit `--reset`.

## 6. Diese Einstellungen prüfen

- [ ] **Auto Deploy während Events ausschalten.** Sonst startet jeder Push nach `main` die App neu. Die Handys verbinden sich zwar selbst wieder, aber die App ist für die Dauer des Neustarts weg.
- [ ] **Preview Deployments aus lassen:** Eine Vorschau würde eigene Daten und Selfies erzeugen.
- [ ] **„Connect to predefined network“ aus lassen:** Die App erreicht die Datenbank über den Namen `postgres`. In einem geteilten Netz könnte dieser Name auf eine andere Datenbank zeigen.
- [ ] **Datenschutz im Proxy:** Die App protokolliert keine IP-Adressen. Prüfe unter **Servers → Proxy**, dass auch Zugriffsprotokolle des Proxys aus sind (`accesslog` bei Traefik), und unter **Log Drains**, dass Logs nicht an Dritte gehen. Beides würde der Datenschutzerklärung widersprechen.
- [ ] **Beim Löschen der Anwendung** fragt Coolify nach den Volumes. Damit wären Datenbank und Sicherungen weg.

## 7. Betrieb

**Update:** Push nach `main`, dann **Redeploy** (oder Auto Deploy). Migrationen laufen beim Start automatisch. Datenbank und Sicherungen liegen in Volumes und bleiben erhalten.

**Domain ändern:** Danach neu deployen, weil die Adresse beim Start übernommen wird. QR-Codes und Präsentationslinks ändern sich dann.

**Überwachung:** Einen externen Uptime-Check auf `/api/health` richten. Der Dienst gilt erst nach einer Minute ohne Antwort als ungesund. Dann nimmt ihn der Proxy aus dem Routing, und die Seite zeigt „No Available Server“.

### Sicherungen

Der Dienst `backup` sichert die Datenbank beim Start und danach alle 24 Stunden ins Volume `backups` und behält 7 Tage. Fotos sind nicht enthalten. Sie liegen im S3-Speicher und werden nach der Löschfrist entfernt.

Die Sicherungen liegen auf demselben Server. Für den Ausfall des ganzen Servers brauchst du eine zweite Kopie, z. B. Hetzner-Server-Backups. Auch dort höchstens 7 Tage aufbewahren, so steht es in der Datenschutzerklärung.

**Wiederherstellen** (überschreibt die aktuelle Datenbank):

1. App stoppen. Auf dem Server per SSH: `docker ps --filter name=app-`, dann `docker stop <name>`.
2. Unter **Terminal** den Container `backup` wählen:
   ```bash
   ls -lh /backups
   pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" /backups/comatch-20261101-030000.dump
   ```
3. In Coolify **Restart** klicken.

## Wenn etwas nicht klappt

| Problem                                       | Ursache und Lösung                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Deployment startet nicht, Variable fehlt      | Ein Pflichtfeld aus Abschnitt 4 ist leer.                                                                             |
| „No Available Server“                         | Port in der Domain fehlt (`:3000`) oder der Dienst `app` ist nicht gesund. Runtime Logs ansehen.                      |
| App startet nicht, Fehler zu `S3` oder Bucket | Endpunkt, Schlüssel oder Bucket falsch. Die App prüft den Bucket beim Start.                                          |
| Links und QR-Code zeigen eine falsche Adresse | Domain geändert, aber nicht neu deployt.                                                                              |
| Kamera öffnet sich nicht direkt               | Die Seite läuft ohne HTTPS, z. B. unter der automatischen `sslip.io`-Adresse. Eigene Domain mit `https://` eintragen. |
| Datenbank-Anmeldung schlägt fehl              | `SERVICE_PASSWORD_POSTGRES` wurde nach dem ersten Start geändert. Alten Wert wieder eintragen.                        |

## Was getestet ist

Getestet wurde lokal, nicht auf einer echten Coolify-Instanz: dieselbe Compose-Datei mit nachgestellten `SERVICE_*`-Werten hinter Traefik. Das umfasst 100 Bots mit WebSockets, Sicherheits-Header, Admin-Konto, Neuerstellung der Container ohne Datenverlust, Sicherung und Wiederherstellung.

Noch offen, weil dafür echte Zugänge nötig sind: wie Coolify die Datei einliest und die Domain verdrahtet, Let's-Encrypt-Zertifikat und Hetzner Object Storage. Lokal lief der Speicher gegen den Emulator RustFS. Prüfe beim ersten Deployment deshalb auch, dass ein Selfie hochgeladen und angezeigt wird, und danach das [Probe-Event](DEPLOY.md#4-probe-event-vor-dem-ersten-echten-einsatz).

Quellen: [Coolify: Docker Compose](https://coolify.io/docs/knowledge-base/docker/compose), [Coolify: Compose Build Pack](https://coolify.io/docs/applications/build-packs/docker-compose).
