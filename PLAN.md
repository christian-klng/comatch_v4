# CoMatch – Plan für eine Live-Matchmaking-Web-App für Gründer*innen

Stand: 27.10.2026 · Status: Entwurf, Grundsatzentscheidungen getroffen (siehe Abschnitt 8)

---

## 1. Ziel und Kernidee

CoMatch bringt Startup-Gründer*innen auf Präsenzveranstaltungen zusammen. Teilnehmende scannen einen QR-Code auf der Leinwand, beantworten drei Fragen, machen ein Selfie und bekommen dann in festen Runden (Standard: 5 Minuten) eine passende Person zugeteilt. Sie sehen deren Selfie, suchen die Person im Raum und bestätigen das Treffen gegenseitig per Code. Die Leinwand zeigt dazu den Countdown bis zur nächsten Runde und eine Live-Animation für jedes bestätigte Match.

**Drei Oberflächen:**

| Ansicht                        | Gerät                                    | Nutzer*in          | Zweck                                                          |
| ------------------------------ | ---------------------------------------- | ------------------ | -------------------------------------------------------------- |
| **Moderationsansicht (Admin)** | Laptop                                   | Admin / Moderation | Event anlegen, Fragen und Rundendauer festlegen, Event steuern |
| **Präsentationsansicht**       | Beamer / Leinwand (Vollbild)             | Publikum           | QR-Code, Countdown, Live-Animationen, Zähler                   |
| **Teilnehmenden-App**          | Smartphone (Browser, keine Installation) | Teilnehmende       | Fragen, Selfie, Match anzeigen, Code bestätigen                |

---

## 2. Nutzerflüsse

### 2.1 Admin: Event vorbereiten

1. Login in die Moderationsansicht. Es gibt mehrere Admin-Konten eines Teams; alle Admins sehen und bearbeiten alle Events.
2. „Neues Event“ anlegen: Name, Datum, Ort (optional), **Event-Branding** (Logo und Primärfarbe, optional; sonst neutrales CoMatch-Standarddesign).
3. Einstellungen:
   - **Rundendauer** (Standard 5:00 min, einstellbar z. B. 2–15 min)
   - **Wartezeit bis zum ersten Match** für Neue (Standard 30 s)
   - **3 Fragen**, jeweils mit **2–4 Antwortoptionen** (Single Choice). Beispiel: „In welcher Phase ist dein Startup?“ → Idee / Pre-Seed / Seed / Series A+
   - **Matching-Modus je Frage:**
     - **gleich:** Personen mit derselben Antwort passen zusammen (Beispiel: Startup-Phase).
     - **ergänzend:** Personen mit sich ergänzenden Antworten passen zusammen (Beispiel: „Was bringst du mit?“ → Tech / Business / Design). Der Admin kann jeder Option eine oder mehrere Gegen-Optionen zuordnen (Tech ↔ Business). Ohne Zuordnung gilt jede _andere_ Antwort als ergänzend.
   - Optional: Gewichtung je Frage (Standard: alle gleich)
4. Speichern → das Event bekommt einen kurzen Link (`/e/abc123`) und einen QR-Code.

### 2.2 Admin: Event live steuern

- **Präsentationsansicht öffnen** (eigener Tab bzw. Fenster, Vollbild auf dem Beamer).
- Status-Steuerung: `Entwurf → Offen (Beitritt möglich) → Läuft (Runden aktiv) → Pausiert → Beendet`.
- Live-Übersicht: Anzahl Teilnehmende (aktiv/inaktiv), aktuelle Runde, offene und bestätigte Matches.
- Eingriffe: „Nächste Runde jetzt starten“, Runde verlängern (+1 min), Teilnehmende entfernen (z. B. bei unpassendem Selfie).
- Nach dem Event: Statistik (Anzahl Matches, Bestätigungsquote, Matches pro Person) und CSV-Export.

### 2.3 Präsentationsansicht (Leinwand)

- **Vor dem Start / Lobby:** großer QR-Code plus Kurz-URL, Event-Titel, Live-Zähler „42 Gründer*innen sind dabei“, eingeblendete Selfies der neu Beigetretenen (dezent).
- **Während der Runden:**
  - großer Countdown bis zur nächsten Runde (mm:ss), ab 10 s mit visueller Betonung
  - QR-Code verkleinert in einer Ecke (Nachzügler können weiterhin beitreten)
  - Zähler: Runde X, bestätigte Matches gesamt bzw. in dieser Runde
  - **Match-Animation in Echtzeit:** Sobald zwei Personen ihr Match bestätigen, fliegen beide Selfies aufeinander zu, „docken“ an und lösen Konfetti oder einen Puls aus. Bei vielen gleichzeitigen Bestätigungen werden die Animationen in einer Warteschlange gebündelt, damit die Leinwand ruhig bleibt.
- **Rundenwechsel:** kurze Einblendung „Neue Runde! Schaut auf euer Handy“.
- **Ende:** Abschlussfolie mit Statistik (z. B. „127 Matches in 6 Runden“) und einer Collage aller Selfies.

### 2.4 Teilnehmende (Smartphone)

1. QR-Code scannen → Startseite des Events, kurze Erklärung in drei Schritten.
2. **3 Fragen** beantworten (je ein Screen, große Antwort-Buttons). Es wird **kein Name** abgefragt; die App bleibt anonym.
3. **Selfie** aufnehmen (Frontkamera, Vorschau, Wiederholen möglich), dazu Einwilligung zur Fotoverarbeitung (DSGVO-Checkbox). Weil das Selfie das einzige Erkennungsmerkmal ist, gibt die App Hinweise: Gesicht gut sichtbar, keine Sonnenbrille, ruhig etwas vom Outfit zeigen.
4. **Warten auf das erste Match** (max. ca. 30 s, mit Animation).
5. **Match-Screen:**
   - großes Selfie der gesuchten Person
   - Gemeinsamkeiten bzw. Ergänzungen als Gesprächseinstieg („Ihr seid beide in der Seed-Phase“, „Tech trifft Business“)
   - **eigener Code**, groß dargestellt (zum Herzeigen)
   - **3 Code-Optionen** zur Auswahl: eine davon ist der Code der anderen Person
   - Button „Person nicht gefunden“ (siehe Sonderfälle)
6. Richtigen Code gewählt → „Warte auf Bestätigung durch dein Gegenüber“. Sobald beide bestätigt haben: Erfolgsanimation, und die Leinwand zeigt das Match.
7. **Pause** mit Countdown bis zur nächsten Runde auf dem Handy („Zeit zum Reden“). Läuft er ab, erscheint automatisch das nächste Selfie und das Spiel beginnt von vorn.

Ein Austausch von Kontaktdaten in der App ist **bewusst nicht vorgesehen**; Kontakte entstehen im Gespräch vor Ort.

---

## 3. Spielregeln und Matching-Logik

### 3.1 Runden

- Das Event hat einen **globalen Rundentakt** (Standard 5 min), den der Server vorgibt.
- Bei jedem Rundenwechsel werden **alle aktiven Teilnehmenden neu gepaart**, auch solche, deren Match in der Vorrunde unbestätigt blieb.
- Alle Geräte erhalten den Endzeitpunkt der Runde als Server-Zeitstempel und berechnen den Countdown lokal, mit Ausgleich des Uhren-Offsets.

### 3.2 Schnelles Erstmatch für Neue

- Wer mitten in einer Runde fertig wird (Fragen + Selfie), landet im **Warte-Pool**.
- Ein **Pool-Matcher** läuft alle paar Sekunden. Sobald eine Person 30 s im Pool ist (oder früher, wenn bereits eine zweite passende Person wartet), wird sie gematcht:
  1. bevorzugt mit einer anderen wartenden Person,
  2. sonst als dritte Person in ein bestehendes, noch **unbestätigtes** Match (Dreiergruppe).
- Personen, die ihr Rundenmatch **schon bestätigt** haben, werden nicht erneut eingesetzt. Sie haben Pause bis zum Rundenende und Zeit für ihr Gespräch.
- Findet sich weder eine wartende Person noch ein offenes Match, wartet die neue Person auf die nächste Runde (Hinweis mit Countdown).
- Dieses Match gilt bis zum Ende der laufenden Runde. **Ausnahme:** Bleiben weniger als ca. 60 s in der Runde, wird die Person direkt in die nächste Runde übernommen und bekommt einen Hinweis.

### 3.3 Paarungsalgorithmus („passende Antworten zusammen“)

- **Übereinstimmung** zweier Personen = Summe über die 3 Fragen (0–3), optional gewichtet. Pro Frage gibt es 1 Punkt, wenn
  - im Modus **gleich** beide dieselbe Option gewählt haben,
  - im Modus **ergänzend** die Optionen als Gegenstücke zugeordnet sind (ohne Zuordnung: wenn sie verschieden sind).
- **Harte Regel:** Niemand trifft dieselbe Person zweimal (solange Alternativen existieren).
- Vorgehen je Rundenwechsel:
  1. Für alle Paare einen Score berechnen: `score = Ähnlichkeit − Strafe(schon getroffen) + kleiner Zufallswert` (der Zufall sorgt für Abwechslung bei Gleichstand).
  2. **Maximum-Weight-Matching**, damit möglichst viele Paare mit hoher Übereinstimmung entstehen. Bei bis zu 100 Personen reicht ein Greedy-Verfahren (Paare nach Score sortieren, nacheinander vergeben) mit anschließender lokaler Verbesserung durch Paartausch. Läuft in Millisekunden.
  3. **Ungerade Anzahl:** Die übrig bleibende Person wird der Dreiergruppe mit der besten Übereinstimmung zugeordnet.
- Die Matching-Engine ist eine **reine Funktion** (Eingabe: Teilnehmende, Antworten, Historie → Ausgabe: Gruppen) und dadurch gut testbar.

### 3.4 Bestätigung per Code

- Jede Person bekommt pro Match einen **eigenen Code**, gut lesbar und ansagbar: z. B. 3-stellige Zahl oder Emoji + Wort („🦊 Fuchs“). Verwechselbare Zeichen werden vermieden.
- Auf dem eigenen Handy: eigener Code groß angezeigt, darunter **3 Optionen**, eine davon der Code des Gegenübers, zwei plausible Köder.
- Die Bestätigung gilt erst, wenn **beide** den Code der jeweils anderen Person gewählt haben → Status `bestätigt` → Event an die Leinwand.
- **Falsche Auswahl:** kurze Sperre (5 s), neue Anordnung der Optionen; nach 3 Fehlversuchen nur noch Hinweis „Zeigt euch gegenseitig eure Codes“.
- **Dreiergruppen:** Jede Person bestätigt eine der beiden anderen (Ringprinzip A→B→C→A). Die Gruppe gilt als bestätigt, wenn der Ring geschlossen ist.

### 3.5 Sonderfälle

| Situation                                  | Verhalten                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Person nicht auffindbar                    | Button „Nicht gefunden“ → ab Rundenmitte Rematch aus dem Pool, sonst Warten auf die nächste Runde                                             |
| Teilnehmende verlässt den Raum / Handy aus | Heartbeat per WebSocket; wer >60 s offline ist, wird „inaktiv“ und in der nächsten Runde nicht gepaart. Bei Rückkehr automatisch wieder aktiv |
| Seite neu geladen / Handy gesperrt         | Sitzungstoken im `localStorage` → Zustand wird beim Wiederverbinden vollständig vom Server geladen                                            |
| Nur 1 Person im Event                      | Freundlicher Warte-Screen „Du bist die erste Person – gleich kommen weitere“                                                                  |
| Alle haben sich schon getroffen            | Wiederholte Paare zulassen, bevorzugt mit dem längsten Abstand                                                                                |
| Unpassendes Selfie                         | Admin kann Person entfernen bzw. das Selfie zurücksetzen (Person muss neu fotografieren)                                                      |

---

## 4. Technische Architektur

### 4.1 Empfohlener Stack

| Bereich       | Wahl                                                                                                                                | Begründung                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sprache       | **TypeScript** überall                                                                                                              | gemeinsame Typen für Client und Server                                                                            |
| Frontend      | **React + Vite** (oder Next.js), Tailwind CSS                                                                                       | drei Ansichten als Routen einer App                                                                               |
| Animation     | **Framer Motion** bzw. CSS-Animationen, `canvas-confetti`                                                                           | flüssige Match-Animationen auf der Leinwand                                                                       |
| Backend       | **Node.js (Fastify) + Socket.IO**                                                                                                   | ein langlebiger Prozess hält Rundentakt und Echtzeitverbindungen; Socket.IO bringt Reconnect und Rooms mit        |
| Datenbank     | **PostgreSQL** + Drizzle oder Prisma                                                                                                | Events, Teilnehmende, Antworten, Matches, Historie                                                                |
| Bild-Speicher | **Hetzner Object Storage** (S3-kompatibel, Standort DE)                                                                             | Selfies; Auslieferung über signierte, kurzlebige URLs. Für den Anfang ginge auch ein Docker-Volume auf dem Server |
| QR-Code       | `qrcode` (npm)                                                                                                                      | serverseitig oder im Browser erzeugt                                                                              |
| Hosting       | **Hetzner Cloud** (Rechenzentrum in Deutschland), ein Server mit **Docker Compose**: Caddy (TLS, Reverse Proxy), Node-App, Postgres | Datenhaltung vollständig in Deutschland; ein kleiner Server (z. B. CX22) reicht für 100 Teilnehmende              |
| Deployment    | GitHub Actions baut das Docker-Image und spielt es per SSH ein (alternativ Coolify als Self-Hosted-PaaS auf demselben Server)       | reproduzierbar, kein Klicken auf dem Server                                                                       |
| Admin-Auth    | E-Mail + Passwort für mehrere Admin-Konten; neue Admins werden von bestehenden eingeladen                                           | Teilnehmende brauchen **kein** Konto                                                                              |

> Supabase o. Ä. scheidet durch die Vorgabe „deutscher Hoster“ aus. Ein eigener Node-Prozess ist für ein serverseitiges Taktgeber-Spiel ohnehin einfacher und verlässlicher.
>
> **Betrieb:** tägliches Postgres-Backup (z. B. `pg_dump` in den Object Storage), Hetzner-Snapshots vor jedem Event, einfaches Uptime-Monitoring.

### 4.2 Systemüberblick

```
 ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐
 │ Admin (Web)  │   │ Präsentation     │   │ Teilnehmende (×N) │
 └──────┬───────┘   └────────┬─────────┘   └─────────┬─────────┘
        │ REST + WS          │ WS (nur lesen)        │ REST + WS
        └──────────┬─────────┴───────────┬───────────┘
                   ▼                     ▼
          ┌─────────────────────────────────────┐
          │ Node-Server (Fastify + Socket.IO)    │
          │  • Event-Steuerung (State Machine)   │
          │  • Rundentakt (Scheduler)            │
          │  • Pool-Matcher (alle 2–3 s)         │
          │  • Matching-Engine (pure function)   │
          │  • Bestätigungslogik                 │
          └──────────┬──────────────┬───────────┘
                     ▼              ▼
              PostgreSQL       Bild-Bucket (Selfies)
```

- **Server ist die einzige Quelle der Wahrheit** für Zeit, Runden und Matches.
- Zustand eines laufenden Events liegt **im Speicher** (schnell) und wird bei jeder Änderung in Postgres geschrieben. Nach einem Neustart wird er aus der DB wiederhergestellt, Timer werden aus `round_ends_at` neu berechnet.
- Eine Instanz reicht mit großem Puffer (erwartet: bis 100 Teilnehmende pro Event, wenige Events parallel). Horizontale Skalierung ist nicht vorgesehen.

### 4.3 Echtzeit-Kanäle (Socket.IO-Rooms)

| Room                   | Empfänger        | Nachrichten (Server → Client)                                                                              |
| ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `event:{id}:presenter` | Leinwand + Admin | `participant_joined`, `round_started {n, endsAt}`, `match_confirmed {selfieA, selfieB}`, `stats`           |
| `event:{id}:admin`     | Moderation       | wie oben + `participant_status`, detaillierte Zahlen                                                       |
| `participant:{id}`     | ein Handy        | `state` (vollständiger Zustand), `match_assigned`, `partner_confirmed`, `match_confirmed`, `round_started` |

Client → Server: `heartbeat`, `submit_code {matchId, code}`, `not_found {matchId}`.
Profil, Antworten und Selfie-Upload laufen über REST.

**Prinzip „Snapshot statt Delta“:** Jede Zustandsänderung an Teilnehmende sendet den kompletten, kleinen Zustand. Verpasste Nachrichten sind dadurch unkritisch.

### 4.4 Datenmodell (vereinfacht)

```
admin_user      (id, email, password_hash, invited_by, created_at)

event           (id, slug, title, starts_at, status, round_duration_s,
                 first_match_delay_s, current_round, round_ends_at,
                 logo_key, primary_color, created_by, created_at)

question        (id, event_id, position 1..3, text, weight,
                 match_mode [same|complementary])
answer_option   (id, question_id, position, label)
option_complement (option_id, complement_option_id)   -- nur für „ergänzend“

participant     (id, event_id, session_token_hash,
                 selfie_key, consent_at, status [onboarding|pool|matched|
                 confirmed|inactive|removed], last_seen_at, joined_at)
participant_answer (participant_id, question_id, answer_option_id)

round           (id, event_id, number, started_at, ends_at)

match_group     (id, event_id, round_id, kind [round|pool], status
                 [open|confirmed|expired], similarity, created_at, confirmed_at)
match_member    (match_group_id, participant_id, own_code,
                 confirms_participant_id, confirmed_at, wrong_attempts)

pair_history    (event_id, participant_a, participant_b, times_met)
```

### 4.5 Selfie-Verarbeitung

- Aufnahme im Browser per `getUserMedia` (Frontkamera) mit eigener Vorschau; Fallback: `<input type="file" accept="image/*" capture="user">`.
- **Clientseitig verkleinern** (z. B. 720 px, JPEG ~80 %) → kleine Uploads auch im schwachen Event-WLAN.
- Upload über eine vorab signierte URL direkt in den Bucket; der Server speichert nur den Schlüssel.
- Ausgabe nur über kurzlebige, signierte URLs, und nur an Personen, die ein Match mit der Person haben, sowie an Leinwand und Admin.

### 4.6 Zeit-Synchronisation

- Server sendet `serverNow` bei Verbindungsaufbau und mit jedem Heartbeat → Client berechnet den Offset.
- Countdown = `roundEndsAt − (Date.now() + offset)`. So zeigen Leinwand und Handys dieselbe Zeit an.
- Optional: **Screen Wake Lock API**, damit das Handy während der Suche nicht in den Ruhezustand geht.

---

## 5. Datenschutz und Sicherheit (DSGVO)

- Ausdrückliche **Einwilligung** vor der Selfie-Aufnahme, kurzer Text mit Link zur Datenschutzerklärung.
- **Datensparsamkeit:** kein Konto, keine E-Mail, kein Name, kein Kontaktaustausch. Gespeichert werden nur Selfie und die 3 Antworten.
- **Automatische Löschung** von Selfies und personenbezogenen Daten z. B. 24 h nach Eventende (konfigurierbar); Statistiken bleiben anonymisiert erhalten.
- Teilnehmende können jederzeit „Ich steige aus“ wählen → Daten werden sofort gelöscht.
- Session-Token nur gehasht in der DB; Rate-Limiting auf Beitritt, Upload und Code-Eingabe.
- Admin-Routen geschützt; die Präsentationsansicht nutzt einen eigenen, nur lesenden Token im Link (kann ohne Admin-Login auf dem Beamer-Rechner laufen).
- Hosting in Deutschland (Hetzner, Server und Object Storage in DE), Auftragsverarbeitungsvertrag mit Hetzner abschließen.

---

## 6. UX-Leitlinien

- **Mobile first**, große Touch-Flächen, gut lesbar auch bei schwachem Saallicht.
- Kein Login, kein App-Download: vom QR-Code bis zum ersten Match in **unter 90 Sekunden**.
- Klare, spielerische Sprache und durchgängig geschlechtergerechte Formulierungen.
- Leinwand bei 3–10 m Abstand lesbar: hoher Kontrast, Countdown sehr groß, Event-Branding (Logo, Primärfarbe) einstellbar.
- Haptisches Feedback (`navigator.vibrate`) beim neuen Match und bei Bestätigung (wo unterstützt).
- Mehrsprachigkeit vorbereiten (DE zuerst, EN als zweite Sprache).

---

## 7. Umsetzungsplan (Meilensteine)

| #      | Meilenstein                | Inhalt                                                                                                                                                                                | Ergebnis                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **M0** | Projektsetup               | Monorepo (`apps/web`, `apps/server`, `packages/shared`), TypeScript, Linting, DB-Schema, Docker Compose (lokal identisch zu Prod), Hetzner-Server mit Caddy, CI/CD per GitHub Actions | lauffähiges Grundgerüst, Deploy auf Staging |
| **M1** | Moderationsansicht         | Admin-Login mit mehreren Konten und Einladung, Event-CRUD, Fragen-Editor (3 Fragen × 2–4 Optionen, Modus gleich/ergänzend, Gegen-Optionen), Event-Branding, QR-Code und Links         | Admin kann Event vollständig konfigurieren  |
| **M2** | Onboarding Teilnehmende    | Join-Seite, Fragen-Flow, Selfie-Aufnahme mit Hinweisen + Upload, Einwilligung, Session-Wiederherstellung                                                                              | Teilnehmende sind „bereit“ im Pool          |
| **M3** | Matching-Engine            | Score mit beiden Modi, Paarung, Dreiergruppen, Wiederholungsvermeidung, Pool-Matcher; **Unit-Tests** und Simulation                                                                   | getestete, deterministische Engine          |
| **M4** | Runden + Echtzeit          | Scheduler, State Machine des Events, Socket.IO-Rooms, Zeit-Sync, Heartbeat/Inaktivität                                                                                                | Runden laufen automatisch durch             |
| **M5** | Match-Screen + Bestätigung | Partner-Selfie, Gemeinsamkeiten, Codes + Köder, Fehlversuche, „nicht gefunden“                                                                                                        | kompletter Spielablauf am Handy             |
| **M6** | Präsentationsansicht       | Lobby mit QR, Countdown, Match-Animation mit Warteschlange, Rundenwechsel, Abschlussfolie                                                                                             | beamertaugliche Live-Show                   |
| **M7** | Admin-Live-Steuerung       | Start/Pause/Ende, nächste Runde, Verlängern, Teilnehmende entfernen, Statistik, CSV-Export                                                                                            | Moderation hat volle Kontrolle              |
| **M8** | Härtung                    | Lasttest mit 150–200 simulierten Clients (Bot-Skript, 1,5–2× Puffer), Reconnect-Tests, schwaches WLAN (Throttling), Neustart-Recovery                                                 | stabil unter Event-Bedingungen              |
| **M9** | Datenschutz + Launch       | Auto-Löschung, Datenschutztexte, Impressum, AV-Vertrag Hetzner, Backups, Produktiv-Deploy, Probe-Event                                                                                | einsatzbereit                               |

**Empfehlung für einen ersten Prototyp (MVP):** M0–M6 mit vereinfachtem Admin (Event per Formular, Start-Button). Damit lässt sich die App bereits auf einem kleinen Event testen. M7–M9 folgen vor dem ersten großen Einsatz.

### Teststrategie

- **Unit-Tests** für die Matching-Engine (gerade/ungerade Anzahl, Wiederholungen, Gewichtung, Modi gleich/ergänzend, Randfälle mit 1–3 Personen, kleine Events mit 6–12 Personen, in denen sich Wiederholungen nicht vermeiden lassen).
- **Integrationstests** für Rundenwechsel und Bestätigungslogik mit simulierter Zeit (Fake-Timer).
- **Simulations-Skript:** N Bots treten bei, beantworten zufällig, bestätigen nach Zufallszeit. Prüft Last, Fairness (Matches pro Person) und Laufzeiten.
- **Gerätetest** auf iOS Safari und Android Chrome (Kamera, Wake Lock, Hintergrund-Reconnect).

---

## 8. Entscheidungen (27.10.2026)

| #   | Thema               | Entscheidung                                                                                                |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Antwortformat       | **Single Choice** mit 2–4 Optionen je Frage                                                                 |
| 2   | Matching-Logik      | **Pro Frage einstellbar:** „gleich“ oder „ergänzend“ (mit optionalen Gegen-Optionen, z. B. Tech ↔ Business) |
| 3   | Name                | **Kein Name**, Teilnehmende bleiben anonym; Erkennung nur über das Selfie                                   |
| 4   | Bestätigte Personen | **Pause bis Rundenende**, kein Bonusmatch für Neue                                                          |
| 5   | Kontaktaustausch    | **Nur offline**, keine Kontaktdaten in der App                                                              |
| 6   | Admins              | **Ein Team mit mehreren Admin-Konten**, alle sehen alle Events (kein Multi-Tenant)                          |
| 7   | Eventgröße          | **Bis 100 Teilnehmende**; Lasttest mit 150–200 Clients                                                      |
| 8   | Name und Branding   | **CoMatch**; Logo und Primärfarbe je Event einstellbar                                                      |
| 9   | Hosting             | **Deutscher Hoster**: Hetzner Cloud + Object Storage, Docker Compose                                        |

### Noch offen (klärt sich in der Umsetzung)

- Format der Bestätigungscodes: Zahl oder Emoji + Wort (Entscheidung nach einem kurzen Test mit echten Personen im Raum). _Umgesetzt: dreistellige Zahlen; Emoji + Wort wäre in `codes.ts` austauschbar._
- Konkrete Texte für Einwilligung und Datenschutzerklärung (mit Datenschutzberatung abstimmen). _Entwurf umgesetzt (`/datenschutz`), Prüfung durch die Beratung steht aus._
- Aufbewahrungsdauer der Selfies nach Eventende (Vorschlag: 24 h). _Umgesetzt: 24 h, per `RETENTION_HOURS` einstellbar._
