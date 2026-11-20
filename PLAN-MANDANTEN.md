# CoMatch – Plan für Mehr-Mandanten-Fähigkeit

Stand: 20.11.2026 · Status: Entwurf, Entscheidungen in Abschnitt 8 offen

Ergänzt [PLAN.md](PLAN.md) und hebt dessen Entscheidung 6 („ein Team, kein Multi-Tenant“) auf.

---

## 1. Ziel

Heute gibt es genau ein Team: Jedes Admin-Konto sieht und steuert alle Events, neue Admins kommen nur per Einladung oder Kommandozeile dazu. Künftig soll sich jede Person selbst ein **Konto** anlegen und darin beliebig viele Events erstellen und durchführen können. Konten sind strikt voneinander getrennt.

Für Teilnehmende und die Leinwand ändert sich nichts: Beitritt per QR-Code, kein Login, gleiche Links.

**Nicht Teil dieses Plans:** Bezahlung und Tarife, eigene Domains je Konto, Login über Google o. Ä., eine Person in mehreren Konten.

---

## 2. Ausgangslage im Code

| Bereich                                                               | Heute                                                                                                                                         | Folge für Mandanten                                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Datenmodell ([schema.ts](apps/server/src/db/schema.ts))               | `admin_user`, `admin_invite`, `event` ohne Besitzer-Bezug (`event.created_by` ist nur Information)                                            | Konto als neue Ebene über Admins und Events             |
| Admin-API ([admin-events.ts](apps/server/src/routes/admin-events.ts)) | `requireEvent(id)` prüft nur, ob das Event existiert. `listEvents` liefert alle. `control` und der CSV-Export laden das Event auf eigenem Weg | Jeder Zugriff muss auf das eigene Konto begrenzt werden |
| Echtzeit ([socket.ts:89](apps/server/src/realtime/socket.ts:89))      | Rolle `admin`: jede gültige Admin-Sitzung darf dem Raum jedes Events beitreten                                                                | Konto des Events prüfen                                 |
| Team ([admin-team.ts](apps/server/src/routes/admin-team.ts))          | Listet und löscht alle Admins und Einladungen                                                                                                 | Auf das Konto begrenzen, Rollen einführen               |
| Anmeldung ([auth.ts](apps/server/src/routes/auth.ts))                 | Nur Login. Kein Registrieren, kein „Passwort vergessen“ (Reset nur per `create-admin.ts --reset`)                                             | Selbstbedienung nötig                                   |
| E-Mail                                                                | Es wird nirgends Mail verschickt. Einladungslinks kopiert man von Hand                                                                        | Mailversand ist neue Infrastruktur                      |
| Recht ([config.ts](apps/server/src/config.ts))                        | Ein Betreiber, Angaben aus `LEGAL_*`                                                                                                          | Veranstalter je Konto, siehe Abschnitt 6                |
| Startseite ([main.tsx](apps/web/src/main.tsx))                        | `/` zeigt die `DevStatusPage`                                                                                                                 | Braucht eine echte Startseite mit Registrierung         |
| Teilnehmende, Leinwand, Matching, Bildspeicher                        | Hängen ausschließlich am Event (`event_id`, Slug, `presenter_token`, Schlüssel `events/<id>/…`)                                               | **Bleiben unverändert**                                 |

Der letzte Punkt macht das Vorhaben überschaubar: Die Trennung muss nur an der Admin-Seite eingezogen werden.

---

## 3. Zielbild

### 3.1 Begriffe

- **Konto** (`account`): der Mandant. Gehört einer Organisation oder Einzelperson, besitzt Events.
- **Nutzer\*in** (`admin_user`, Name der Tabelle bleibt): meldet sich an, gehört zu **genau einem** Konto. Die E-Mail bleibt global eindeutig.
- **Rolle:** `owner` (genau eine Person je Konto; verwaltet Team, Kontodaten, Löschung) oder `member` (verwaltet Events).

Wer sich registriert, bekommt ein neues Konto und ist dessen Owner. Weitere Personen kommen wie heute per Einladung ins Konto.

### 3.2 Datenmodell

```
account        (id, name, status [active|suspended], created_at,
                legal_name, legal_address, legal_email)      -- Veranstalter-Angaben, Abschnitt 6

admin_user     + account_id  NOT NULL → account, ON DELETE CASCADE
               + role [owner|member]
               + email_verified_at
               + is_platform_admin (Standard false)
admin_invite   + account_id  NOT NULL → account, ON DELETE CASCADE
event          + account_id  NOT NULL → account, ON DELETE RESTRICT   (Index auf account_id)

auth_token     (token_hash PK, admin_id, kind [verify_email|reset_password],
                expires_at, used_at)
```

- `event.account_id` mit `RESTRICT`: Ein Konto wird über einen eigenen Ablauf gelöscht, der auch den Bildspeicher leert (Abschnitt 6), nicht über eine Kaskade.
- Ein partieller Unique-Index stellt sicher, dass es je Konto genau einen Owner gibt.
- Alle Tabellen unterhalb von `event` bekommen **keine** `account_id`; sie sind über das Event eindeutig zugeordnet.

### 3.3 Migration der bestehenden Instanz

Eine Migration `0009`, ohne Ausfall und ohne sichtbare Änderung:

1. `account` anlegen, ein Konto für den heutigen Betreiber einfügen.
2. Spalten nullable ergänzen, alle bestehenden Admins, Einladungen und Events diesem Konto zuweisen.
3. Ältester Admin wird `owner`, alle bekommen `email_verified_at = created_at`.
4. Spalten auf `NOT NULL` setzen.

Danach verhält sich die Produktivinstanz wie vorher, nur eben als ein Konto unter künftig mehreren.

### 3.4 Trennung der Konten

Grundsatz: **Ein fremdes Event existiert nicht** (Antwort 404, nicht 403).

- `findAdminBySession` liefert zusätzlich `accountId` und `role` und lehnt gesperrte Konten ab. `AdminMe` in `packages/shared` wird entsprechend erweitert.
- Die Prüfung sitzt an **einer** Stelle: ein Hook im `/admin`-Bereich für alle Routen mit `/events/:id`, der das Event mit `account_id = request.admin.accountId` lädt und an die Anfrage hängt. Das ersetzt `requireEvent` und schließt die beiden Routen ein, die heute daran vorbeigehen (`control`, Export).
- `listEvents` und `createEvent` bekommen die `accountId` als Pflichtparameter.
- Socket-Rolle `admin`: Raum nur betreten, wenn das Event zum Konto gehört.
- Team-Routen filtern nach Konto. Einladen, Entfernen und Kontodaten ändern darf nur der Owner.
- Einladung an eine E-Mail, die schon irgendwo ein Konto hat: Ablehnung mit klarer Meldung.

Abgesichert wird das durch einen Test, der **jede** Admin-Route und den Socket mit einer Sitzung aus Konto B gegen ein Event aus Konto A aufruft und 404 erwartet. Der Test läuft über die Liste der registrierten Routen, damit neue Routen nicht unbemerkt ohne Prüfung dazukommen.

### 3.5 Registrierung und Anmeldung

| Ablauf                                        | Verhalten                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registrieren `/signup`                        | E-Mail, Passwort (≥ 10 Zeichen wie bisher), Name des Kontos, Zustimmung zu Nutzungsbedingungen und AV-Vertrag. Legt Konto und Owner an und schickt eine Bestätigungsmail |
| E-Mail bestätigen `/verify/:token`            | Setzt `email_verified_at`, meldet an. Ohne Bestätigung kein Login                                                                                                        |
| Passwort vergessen `/forgot`, `/reset/:token` | Link per Mail, 1 h gültig, einmal verwendbar. Löscht alle Sitzungen der Person                                                                                           |
| Einladung                                     | Wie bisher, zusätzlich per Mail verschickt. Gilt als bestätigte E-Mail                                                                                                   |

- Antworten verraten nicht, ob eine E-Mail schon registriert ist („Falls … schicken wir dir eine Mail“).
- Rate-Limits auf Registrierung, Bestätigung und Reset wie heute beim Login.
- Unbestätigte Konten ohne Events werden nach 7 Tagen gelöscht (im bestehenden Aufräumlauf von `retention.ts`).
- Schalter `SIGNUP_MODE = open | closed` (Standard `closed`), damit die Registrierung getrennt vom Rest freigeschaltet werden kann.

**Mailversand:** `nodemailer` über SMTP (`SMTP_URL`, `MAIL_FROM`), hinter einer kleinen Schnittstelle `Mailer` mit Test-Attrappe, analog zu `storage/`. Der Anbieter muss in der EU sitzen (Vorgabe „deutscher Hoster“), dazu SPF und DKIM für die Absenderdomain.

### 3.6 Grenzen und Missbrauchsschutz

Der Server ist eine einzelne Instanz, die laufende Events im Speicher hält. Mit offener Registrierung braucht es Grenzen:

- je Konto: höchstens 2 Events gleichzeitig im Status `running`/`paused`, höchstens 150 Teilnehmende je Event (Beitritt darüber wird freundlich abgelehnt). Werte in `account` überschreibbar.
- Konto sperren (`status = suspended`): Login und Beitritt zu dessen Events sind aus.
- **Plattform-Verwaltung** für den Betreiber (`is_platform_admin`): Liste der Konten mit Zahl der Events und letzter Aktivität, Sperren und Entsperren. Zunächst als kleines Skript wie `create-admin.ts`, eine Oberfläche erst bei Bedarf.

### 3.7 Oberfläche

- Startseite `/` mit kurzer Erklärung, „Konto anlegen“ und „Anmelden“. Die `DevStatusPage` wandert nach `/status`.
- Neue Seiten: Registrieren, E-Mail bestätigen, Passwort vergessen und zurücksetzen.
- Admin-Kopfzeile zeigt den Kontonamen. Neuer Punkt **Konto** (nur Owner): Name, Veranstalter-Angaben, Konto löschen. „Team“ bleibt, zeigt Rollen, und nur der Owner sieht die Schaltflächen.
- Leere Eventliste nach der Registrierung führt direkt zu „Erstes Event anlegen“.

---

## 4. Was sich nicht ändert

Teilnahme-Links (`/e/:slug`, Slugs bleiben global eindeutig), Präsentationslink mit Token, Matching, Runden, Bildspeicher und dessen Schlüssel, automatische Löschung nach 24 h, Sprache und Branding je Event. Bestehende QR-Codes und Links funktionieren weiter.

---

## 5. Betrieb und Kapazität

- [PLAN.md](PLAN.md) ging von „wenigen Events parallel“ aus. `scripts/loadtest.ts` wird erweitert auf **10 Events gleichzeitig mit je 100 Bots**; daraus ergibt sich die Servergröße und ein globales Limit für gleichzeitig laufende Events.
- Selfies liegen derzeit in Postgres (`media_object`). Bei vielen Konten wächst die Datenbank bis zur Löschfrist stärker; vor dem Öffnen der Registrierung die Größe beobachten und bei Bedarf auf S3 zurückstellen (ist bereits vorgesehen).
- Backup und Deployment bleiben unverändert. Neue Variablen: `SMTP_URL`, `MAIL_FROM`, `SIGNUP_MODE`.

---

## 6. Datenschutz und Recht

Das ist der Teil mit dem größten Aufwand außerhalb des Codes und braucht die Datenschutzberatung.

- **Rollenwechsel:** Heute ist der Betreiber Verantwortlicher für alle Events. Mit fremden Konten wird der jeweilige **Veranstalter Verantwortlicher** für Selfies und Antworten seiner Teilnehmenden, der Plattformbetreiber **Auftragsverarbeiter**. Dafür braucht es einen **AV-Vertrag** mit jedem Konto (Zustimmung bei der Registrierung, mit Zeitpunkt und Fassung gespeichert) und Hetzner sowie den Mailanbieter als Unterauftragsverarbeiter.
- **Hinweise für Teilnehmende:** Einwilligung und Datenschutzhinweis auf der Join-Seite nennen den Veranstalter aus `account.legal_*`. Ein Event lässt sich erst auf „Offen“ stellen, wenn diese Angaben ausgefüllt sind. `/datenschutz` und `/privacy` bekommen eine Fassung je Event (`/e/:slug/datenschutz`).
- **Daten der Kontoinhaber\*innen:** Neu werden E-Mail-Adressen fremder Personen verarbeitet; die Datenschutzerklärung der Plattform wird um diesen Teil ergänzt. Dazu **Nutzungsbedingungen**.
- **Konto löschen:** Owner kann das Konto löschen. Ablauf: laufende Events müssen beendet sein, dann je Event Bildspeicher leeren (`events/<id>/`), Events, Nutzer*innen und Konto löschen. Einzelne Mitglieder kann der Owner wie bisher entfernen.
- **Löschfrist:** bleibt global bei 24 h. Eine Einstellung je Konto ist möglich, aber nicht geplant.

---

## 7. Meilensteine

| #      | Meilenstein             | Inhalt                                                                                                                                  | Ergebnis                                                                       |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **T1** | Konto und Trennung      | Tabelle `account`, Migration 0009, `accountId` in Sitzung, zentraler Event-Hook, Socket-Prüfung, Team nach Konto, Test über alle Routen | Mandantentrennung steht; Produktivinstanz läuft unverändert als ein Konto      |
| **T2** | Rollen und Kontoseite   | `owner`/`member`, Owner übertragen, Seite „Konto“ mit Namen und Veranstalter-Angaben                                                    | Ein Konto verwaltet sich selbst                                                |
| **T3** | Mail und Passwort       | `Mailer`, SMTP-Einrichtung, Einladungen per Mail, „Passwort vergessen“                                                                  | Kein Griff zur Kommandozeile mehr nötig; auch für die heutige Instanz nützlich |
| **T4** | Registrierung           | `/signup`, E-Mail-Bestätigung, Startseite, Rate-Limits, Aufräumen unbestätigter Konten, `SIGNUP_MODE`                                   | Registrierung fertig, noch geschlossen                                         |
| **T5** | Grenzen und Plattform   | Limits je Konto, Sperren, Skript für die Plattform-Verwaltung, Lasttest mit parallelen Events                                           | Betrieb mit fremden Konten abgesichert                                         |
| **T6** | Recht und Freischaltung | AV-Vertrag, Nutzungsbedingungen, Datenschutzhinweis je Veranstalter, Konto löschen, `SIGNUP_MODE=open`                                  | Öffentlich nutzbar                                                             |

T1 bis T3 lassen sich einzeln ausliefern und verändern für die heutigen Nutzer*innen nichts außer dem neuen Passwort-Reset. T6 hängt an der Datenschutzberatung und sollte früh parallel angestoßen werden.

---

## 8. Offene Entscheidungen

| #   | Frage                                                                  | Empfehlung                                                                                              |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Darf eine Person mehreren Konten angehören?                            | **Nein**, genau ein Konto. Deutlich einfacher; lässt sich später über eine Zuordnungstabelle nachrüsten |
| 2   | Registrierung sofort offen oder mit Freigabe durch den Betreiber?      | **Offen mit E-Mail-Bestätigung und Limits.** Freigabe wäre über `account.status` leicht ergänzbar       |
| 3   | Kostenlos oder bezahlt?                                                | Zunächst kostenlos mit den Limits aus 3.6; Tarife sind ein eigenes Vorhaben                             |
| 4   | Welcher Mailanbieter?                                                  | SMTP eines EU-Anbieters; konkrete Wahl offen                                                            |
| 5   | Wer ist Verantwortlicher im Sinne der DSGVO?                           | Der Veranstalter (Abschnitt 6); mit der Datenschutzberatung bestätigen                                  |
| 6   | Branding-Vorgaben je Konto (Logo, Farbe als Standard für neue Events)? | Später; je Event bleibt es einstellbar                                                                  |
