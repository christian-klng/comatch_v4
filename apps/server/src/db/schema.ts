import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  EVENT_STATUSES,
  MATCH_GROUP_KINDS,
  MATCH_GROUP_STATUSES,
  MATCH_MODES,
  PARTICIPANT_STATUSES,
} from "@comatch/shared";

export const eventStatus = pgEnum("event_status", EVENT_STATUSES);
export const participantStatus = pgEnum("participant_status", PARTICIPANT_STATUSES);
export const matchMode = pgEnum("match_mode", MATCH_MODES);
export const matchGroupKind = pgEnum("match_group_kind", MATCH_GROUP_KINDS);
export const matchGroupStatus = pgEnum("match_group_status", MATCH_GROUP_STATUSES);

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export const adminUser = pgTable("admin_user", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  invitedBy: uuid().references((): AnyPgColumn => adminUser.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const adminSession = pgTable(
  "admin_session",
  {
    /** SHA-256 des Session-Tokens aus dem Cookie. */
    tokenHash: text().primaryKey(),
    adminId: uuid()
      .notNull()
      .references(() => adminUser.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index().on(t.adminId)],
);

export const adminInvite = pgTable("admin_invite", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull(),
  /** SHA-256 des Einladungs-Tokens; der Klartext steht nur im Einladungslink. */
  tokenHash: text().notNull().unique(),
  invitedBy: uuid().references(() => adminUser.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  acceptedAt: timestamp({ withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Event und Fragen
// ---------------------------------------------------------------------------

export const event = pgTable("event", {
  id: uuid().primaryKey().defaultRandom(),
  /** Kurzer Code für den Teilnahme-Link (/e/:slug). */
  slug: text().notNull().unique(),
  title: text().notNull(),
  startsAt: timestamp({ withTimezone: true }),
  status: eventStatus().notNull().default("draft"),
  roundDurationS: integer().notNull().default(300),
  firstMatchDelayS: integer().notNull().default(30),
  currentRound: integer().notNull().default(0),
  roundEndsAt: timestamp({ withTimezone: true }),
  /** Restzeit der Runde, während das Event pausiert ist (roundEndsAt ist dann leer). */
  pausedRemainingMs: integer(),
  /**
   * Token, mit dem die Präsentationsansicht ohne Admin-Login lesen darf. Bewusst im Klartext,
   * damit Admins den Link jederzeit erneut anzeigen können; es gewährt nur Lesezugriff.
   */
  presenterToken: text()
    .notNull()
    .unique()
    .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
  /** Logos sind klein (≤ 512 KB) und liegen direkt in der DB; Selfies kommen in den Object Storage. */
  logoData: bytea(),
  logoMime: text(),
  logoUpdatedAt: timestamp({ withTimezone: true }),
  primaryColor: text(),
  createdBy: uuid().references(() => adminUser.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  endedAt: timestamp({ withTimezone: true }),
  /** Selfies und Sitzungen gelöscht (automatisch nach Ablauf der Frist oder per Admin). */
  purgedAt: timestamp({ withTimezone: true }),
});

export const question = pgTable(
  "question",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    text: text().notNull(),
    matchMode: matchMode().notNull().default("same"),
    weight: real().notNull().default(1),
  },
  (t) => [
    uniqueIndex().on(t.eventId, t.position),
    check("question_position_range", sql`${t.position} between 1 and 3`),
  ],
);

export const answerOption = pgTable(
  "answer_option",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    position: smallint().notNull(),
    label: text().notNull(),
  },
  (t) => [uniqueIndex().on(t.questionId, t.position)],
);

/** Gegen-Optionen für Fragen im Modus „ergänzend“ (gerichtet; beide Richtungen werden gespeichert). */
export const optionComplement = pgTable(
  "option_complement",
  {
    optionId: uuid()
      .notNull()
      .references(() => answerOption.id, { onDelete: "cascade" }),
    complementOptionId: uuid()
      .notNull()
      .references(() => answerOption.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.optionId, t.complementOptionId] }),
    check("option_complement_not_self", sql`${t.optionId} <> ${t.complementOptionId}`),
  ],
);

// ---------------------------------------------------------------------------
// Teilnehmende (anonym: kein Name, keine Kontaktdaten)
// ---------------------------------------------------------------------------

export const participant = pgTable(
  "participant",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    sessionTokenHash: text().notNull().unique(),
    selfieKey: text(),
    consentAt: timestamp({ withTimezone: true }),
    status: participantStatus().notNull().default("onboarding"),
    /** Zeitpunkt, ab dem die Person im Warte-Pool ist (für das Schnellmatch nach 30 s). */
    poolSince: timestamp({ withTimezone: true }),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    joinedAt: createdAt(),
  },
  (t) => [index().on(t.eventId, t.status)],
);

export const participantAnswer = pgTable(
  "participant_answer",
  {
    participantId: uuid()
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => question.id, { onDelete: "cascade" }),
    answerOptionId: uuid()
      .notNull()
      .references(() => answerOption.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.questionId] })],
);

// ---------------------------------------------------------------------------
// Runden und Matches
// ---------------------------------------------------------------------------

export const round = pgTable(
  "round",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex().on(t.eventId, t.number)],
);

/** Ein Match: zwei Personen, bei ungerader Anzahl auch drei. */
export const matchGroup = pgTable(
  "match_group",
  {
    id: uuid().primaryKey().defaultRandom(),
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    roundId: uuid()
      .notNull()
      .references(() => round.id, { onDelete: "cascade" }),
    kind: matchGroupKind().notNull(),
    status: matchGroupStatus().notNull().default("open"),
    similarity: real().notNull(),
    createdAt: createdAt(),
    confirmedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.eventId, t.roundId), index().on(t.eventId, t.status)],
);

export const matchMember = pgTable(
  "match_member",
  {
    matchGroupId: uuid()
      .notNull()
      .references(() => matchGroup.id, { onDelete: "cascade" }),
    participantId: uuid()
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    /** Code, den diese Person auf ihrem Handy zeigt. */
    ownCode: text().notNull(),
    /** Wessen Code diese Person eingeben muss (bei Dreiergruppen im Ring A→B→C→A). */
    confirmsParticipantId: uuid()
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    /** Zwei Köder-Codes, die neben dem richtigen Code zur Auswahl stehen. */
    decoyCodes: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    confirmedAt: timestamp({ withTimezone: true }),
    wrongAttempts: smallint().notNull().default(0),
    /** Letzte falsche Auswahl (für die kurze Sperre danach). */
    lastWrongAt: timestamp({ withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.matchGroupId, t.participantId] }), index().on(t.participantId)],
);

/** Wer hat wen schon getroffen? Paare werden normalisiert gespeichert (participantA < participantB). */
export const pairHistory = pgTable(
  "pair_history",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    participantA: uuid()
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    participantB: uuid()
      .notNull()
      .references(() => participant.id, { onDelete: "cascade" }),
    timesMet: integer().notNull().default(1),
    lastRound: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.participantA, t.participantB] }),
    check("pair_history_ordered", sql`${t.participantA} < ${t.participantB}`),
  ],
);
