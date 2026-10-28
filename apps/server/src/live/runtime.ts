import { and, eq, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import {
  EXTEND_ROUND_MS,
  type ConfirmCodeResult,
  type EventControlAction,
  type EventLive,
  type EventStatus,
  type ParticipantLive,
  type SessionEndReason,
} from "@comatch/shared";
import type { Db } from "../db/client.ts";
import { event, matchGroup, matchMember, participant, round } from "../db/schema.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import type { MediaSigner } from "../lib/media.ts";
import { matchPool, pairRound } from "../matching/index.ts";
import type { Clock } from "./clock.ts";
import { giveUpMatch, submitCode } from "./confirm.ts";
import {
  addToGroup,
  completeIfConfirmed,
  currentRoundRow,
  insertGroups,
  loadHistory,
  loadLiveEvent,
  loadPeople,
  loadQuestionsForMatching,
  loadRoundGroups,
  loadSnapshot,
  rewriteMembers,
  type LiveEventRow,
} from "./repository.ts";
import { buildEventLive, buildParticipantLive, isPresent } from "./views.ts";

/** Wie oft der Pool-Matcher während einer Runde nach Wartenden sieht. */
export const POOL_TICK_MS = 3_000;
/** Scheitert der Rundenwechsel (z. B. DB kurz weg), wird er nach dieser Pause wiederholt. */
export const ROUND_RETRY_MS = 5_000;
/** Zähler für Leinwand und Admins werden gebündelt, damit viele Verbindungswechsel nicht fluten. */
const EVENT_STATE_DEBOUNCE_MS = 1_000;

/** Ziel für Live-Nachrichten (in Produktion Socket.IO, in Tests ein Rekorder). */
export interface Emitter {
  toParticipant(participantId: string, state: ParticipantLive): void;
  toEvent(eventId: string, state: EventLive): void;
  invalidate(participantId: string, reason: SessionEndReason): void;
}

export interface LiveDeps {
  db: Db;
  media: MediaSigner;
  clock: Clock;
  log?: FastifyBaseLogger;
}

const nullEmitter: Emitter = { toParticipant() {}, toEvent() {}, invalidate() {} };

/** Status, in denen jemand fertig angemeldet ist und gepaart werden kann. */
const PAIRABLE = ["pool", "matched", "confirmed", "inactive"] as const;

const TRANSITIONS: Record<EventControlAction, readonly EventStatus[]> = {
  start: ["open"],
  pause: ["running"],
  resume: ["paused"],
  next_round: ["running"],
  extend: ["running", "paused"],
  end: ["open", "running", "paused"],
};

/**
 * Steuert laufende Events: Statuswechsel, Rundentakt, Pool-Matcher und Anwesenheit.
 * Postgres bleibt die Quelle der Wahrheit; hier liegen nur Timer und Verbindungen.
 * Alle Änderungen an einem Event laufen nacheinander (eine Warteschlange je Event).
 */
export class LiveEvents {
  private emitter: Emitter = nullEmitter;
  private readonly roundTimers = new Map<string, unknown>();
  private readonly poolTimers = new Map<string, unknown>();
  private readonly eventStateTimers = new Map<string, unknown>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly inFlight = new Set<Promise<unknown>>();
  /** Offene Verbindungen je Person (mehrere Tabs möglich). */
  private readonly connections = new Map<string, { eventId: string; count: number }>();
  /** Zuletzt gesendeter Zustand je Person (ohne Serverzeit), um Wiederholungen zu sparen. */
  private readonly lastSent = new Map<string, string>();

  private deps: LiveDeps;

  constructor(deps: LiveDeps) {
    this.deps = deps;
  }

  attach(emitter: Emitter) {
    this.emitter = emitter;
  }

  setLogger(log: FastifyBaseLogger) {
    this.deps.log = log;
  }

  // -------------------------------------------------------------------------
  // Warteschlange und Timer
  // -------------------------------------------------------------------------

  private run<T>(eventId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(eventId) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => {});
    this.queues.set(eventId, settled);
    this.inFlight.add(settled);
    void settled.then(() => {
      this.inFlight.delete(settled);
      if (this.queues.get(eventId) === settled) this.queues.delete(eventId);
    });
    return next;
  }

  /** Für Timer-Callbacks: Fehler werden geloggt statt verschluckt. */
  private fire(eventId: string, task: () => Promise<unknown>, onError?: () => void) {
    this.run(eventId, task).catch((err: unknown) => {
      this.deps.log?.error({ err, eventId }, "Live-Aufgabe fehlgeschlagen");
      onError?.();
    });
  }

  logError(err: unknown, msg: string) {
    this.deps.log?.error({ err }, msg);
  }

  /** Rundenwechsel; scheitert er, kommt ein neuer Versuch, statt dass das Event stehen bleibt. */
  private armRoundTimer(eventId: string, delay: number) {
    const { clock } = this.deps;
    clock.clearTimeout(this.roundTimers.get(eventId));
    this.roundTimers.set(
      eventId,
      clock.setTimeout(
        () =>
          this.fire(
            eventId,
            () => this.onRoundTimer(eventId),
            () => this.armRoundTimer(eventId, ROUND_RETRY_MS),
          ),
        delay,
      ),
    );
  }

  /** Wartet, bis alle laufenden Aufgaben erledigt sind (für Tests und sauberes Herunterfahren). */
  async idle() {
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
  }

  private clearTimers(eventId: string) {
    const { clock } = this.deps;
    clock.clearTimeout(this.roundTimers.get(eventId));
    clock.clearInterval(this.poolTimers.get(eventId));
    this.roundTimers.delete(eventId);
    this.poolTimers.delete(eventId);
  }

  /** Stellt Rundentimer und Pool-Matcher passend zum Event-Status ein. */
  private schedule(ev: LiveEventRow) {
    const { clock } = this.deps;
    this.clearTimers(ev.id);
    if (ev.status !== "running" || !ev.roundEndsAt) return;
    this.armRoundTimer(ev.id, Math.max(0, ev.roundEndsAt.getTime() - clock.now()));
    this.poolTimers.set(
      ev.id,
      clock.setInterval(
        () =>
          this.fire(ev.id, async () => {
            if (await this.matchWaiting(ev.id)) await this.broadcast(ev.id);
          }),
        POOL_TICK_MS,
      ),
    );
  }

  /** Nach einem Neustart: Timer laufender Events aus der Datenbank wiederherstellen. */
  async restore() {
    const running = await this.deps.db
      .select({ id: event.id })
      .from(event)
      .where(eq(event.status, "running"));
    for (const { id } of running) {
      await this.run(id, async () => {
        const ev = await loadLiveEvent(this.deps.db, id);
        if (!ev) return;
        if (!ev.roundEndsAt || ev.roundEndsAt.getTime() <= this.deps.clock.now()) await this.startRound(id);
        else this.schedule(ev);
      });
    }
  }

  /** Event gelöscht: Timer weg. */
  forget(eventId: string) {
    this.clearTimers(eventId);
    this.deps.clock.clearTimeout(this.eventStateTimers.get(eventId));
    this.eventStateTimers.delete(eventId);
  }

  /** Für Tests: Timer und Verbindungen vergessen. */
  reset() {
    this.stop();
    this.connections.clear();
    this.lastSent.clear();
  }

  /** Alle Timer stoppen (Herunterfahren, Tests). Verbindungen bleiben unberührt. */
  stop() {
    for (const id of new Set([
      ...this.roundTimers.keys(),
      ...this.poolTimers.keys(),
      ...this.eventStateTimers.keys(),
    ])) {
      this.forget(id);
    }
  }

  // -------------------------------------------------------------------------
  // Steuerung durch Admins
  // -------------------------------------------------------------------------

  control(eventId: string, action: EventControlAction): Promise<void> {
    return this.run(eventId, async () => {
      const { db, clock } = this.deps;
      const ev = await loadLiveEvent(db, eventId);
      if (!ev) throw notFound("event_not_found");
      if (!TRANSITIONS[action].includes(ev.status)) {
        throw new HttpError(409, "invalid_transition", "Das geht im aktuellen Status des Events nicht.");
      }
      const now = clock.now();

      switch (action) {
        case "start":
        case "next_round":
          await this.startRound(eventId, action === "start");
          break;
        case "pause": {
          const remaining = Math.max(0, (ev.roundEndsAt?.getTime() ?? now) - now);
          await db
            .update(event)
            .set({ status: "paused", roundEndsAt: null, pausedRemainingMs: remaining })
            .where(eq(event.id, eventId));
          this.clearTimers(eventId);
          break;
        }
        case "resume": {
          const endsAt = new Date(now + (ev.pausedRemainingMs ?? ev.roundDurationS * 1000));
          await db.transaction(async (tx) => {
            await tx
              .update(event)
              .set({ status: "running", roundEndsAt: endsAt, pausedRemainingMs: null })
              .where(eq(event.id, eventId));
            await tx
              .update(round)
              .set({ endsAt })
              .where(and(eq(round.eventId, eventId), eq(round.number, ev.currentRound)));
          });
          this.schedule({ ...ev, status: "running", roundEndsAt: endsAt });
          break;
        }
        case "extend":
          if (ev.status === "paused") {
            await db
              .update(event)
              .set({ pausedRemainingMs: (ev.pausedRemainingMs ?? 0) + EXTEND_ROUND_MS })
              .where(eq(event.id, eventId));
          } else {
            const endsAt = new Date((ev.roundEndsAt?.getTime() ?? now) + EXTEND_ROUND_MS);
            await db.transaction(async (tx) => {
              await tx.update(event).set({ roundEndsAt: endsAt }).where(eq(event.id, eventId));
              await tx
                .update(round)
                .set({ endsAt })
                .where(and(eq(round.eventId, eventId), eq(round.number, ev.currentRound)));
            });
            this.schedule({ ...ev, roundEndsAt: endsAt });
          }
          break;
        case "end":
          await db.transaction(async (tx) => {
            await tx
              .update(matchGroup)
              .set({ status: "expired" })
              .where(and(eq(matchGroup.eventId, eventId), eq(matchGroup.status, "open")));
            await tx
              .update(event)
              .set({ status: "ended", endedAt: new Date(now), roundEndsAt: null, pausedRemainingMs: null })
              .where(eq(event.id, eventId));
          });
          this.clearTimers(eventId);
          break;
      }
      await this.broadcast(eventId);
    });
  }

  // -------------------------------------------------------------------------
  // Runden und Pool
  // -------------------------------------------------------------------------

  private async onRoundTimer(eventId: string) {
    const ev = await loadLiveEvent(this.deps.db, eventId);
    if (ev?.status !== "running") return;
    // Wurde die Runde inzwischen verschoben (z. B. Pause), Timer neu stellen statt zu wechseln.
    if (ev.roundEndsAt && ev.roundEndsAt.getTime() > this.deps.clock.now()) return this.schedule(ev);
    await this.startRound(eventId);
    await this.broadcast(eventId);
  }

  /**
   * Beendet die laufende Runde (offene Matches verfallen) und paart alle aktiven Personen neu.
   * Wer länger weg war, wird inaktiv und bleibt außen vor.
   */
  private async startRound(eventId: string, starting = false) {
    const { db, clock } = this.deps;
    const now = clock.now();
    const connected = this.connectedIds();

    const ev = await db.transaction(async (tx) => {
      const ev = await loadLiveEvent(tx, eventId, true);
      if (!ev) throw notFound("event_not_found");

      await tx
        .update(matchGroup)
        .set({ status: "expired" })
        .where(and(eq(matchGroup.eventId, eventId), eq(matchGroup.status, "open")));

      const candidates = await tx
        .select()
        .from(participant)
        .where(and(eq(participant.eventId, eventId), inArray(participant.status, [...PAIRABLE])));
      const active = candidates.filter((p) => isPresent(p, connected, now));
      const gone = candidates.filter((p) => !isPresent(p, connected, now)).map((p) => p.id);
      if (gone.length > 0) {
        await tx
          .update(participant)
          .set({ status: "inactive", poolSince: null })
          .where(inArray(participant.id, gone));
      }

      const number = ev.currentRound + 1;
      const endsAt = new Date(now + ev.roundDurationS * 1000);
      const [roundRow] = await tx
        .insert(round)
        .values({ eventId, number, startedAt: new Date(now), endsAt })
        .returning({ id: round.id });

      const [questions, people, history] = await Promise.all([
        loadQuestionsForMatching(tx, eventId),
        loadPeople(
          tx,
          active.map((p) => p.id),
        ),
        loadHistory(tx, eventId),
      ]);
      const plan = pairRound(people, { questions, history, round: number, seed: `${eventId}:${number}` });
      await insertGroups(tx, {
        eventId,
        roundId: roundRow!.id,
        roundNumber: number,
        kind: "round",
        groups: plan.groups,
        createdAt: new Date(now),
      });
      if (plan.unmatched.length > 0) {
        await tx
          .update(participant)
          .set({ status: "pool", poolSince: new Date(now) })
          .where(inArray(participant.id, plan.unmatched));
      }

      const update = {
        currentRound: number,
        roundEndsAt: endsAt,
        pausedRemainingMs: null,
        ...(starting ? { status: "running" as const } : {}),
      };
      await tx.update(event).set(update).where(eq(event.id, eventId));
      return { ...ev, ...update };
    });

    this.schedule(ev);
  }

  /** Schnellmatch für Wartende während einer Runde. Gibt zurück, ob neue Matches entstanden sind. */
  private async matchWaiting(eventId: string): Promise<boolean> {
    const { db, clock } = this.deps;
    const now = clock.now();
    const ev = await loadLiveEvent(db, eventId);
    if (ev?.status !== "running" || !ev.roundEndsAt) return false;

    const connected = this.connectedIds();
    const waiting = (
      await db
        .select()
        .from(participant)
        .where(and(eq(participant.eventId, eventId), eq(participant.status, "pool")))
    ).filter((p) => p.poolSince && isPresent(p, connected, now));
    if (waiting.length === 0) return false;

    const roundRow = await currentRoundRow(db, ev);
    if (!roundRow) return false;
    const open = (await loadRoundGroups(db, roundRow.id)).filter(
      (g) => g.status === "open" && g.members.length === 2 && g.members.every((m) => !m.confirmedAt),
    );

    const [questions, people, history] = await Promise.all([
      loadQuestionsForMatching(db, eventId),
      loadPeople(db, [
        ...waiting.map((p) => p.id),
        ...open.flatMap((g) => g.members.map((m) => m.participantId)),
      ]),
      loadHistory(db, eventId),
    ]);
    const personById = new Map(people.map((p) => [p.id, p]));
    const result = matchPool({
      questions,
      history,
      round: ev.currentRound,
      seed: `${eventId}:${ev.currentRound}:${now}`,
      now,
      roundEndsAt: ev.roundEndsAt.getTime(),
      firstMatchDelayMs: ev.firstMatchDelayS * 1000,
      waiting: waiting.map((p) => ({ person: personById.get(p.id)!, poolSince: p.poolSince!.getTime() })),
      openGroups: open.map((g) => ({
        id: g.id,
        members: g.members.map((m) => personById.get(m.participantId)!),
      })),
    });
    if (result.newGroups.length === 0 && result.joins.length === 0) return false;

    await db.transaction(async (tx) => {
      await insertGroups(tx, {
        eventId,
        roundId: roundRow.id,
        roundNumber: ev.currentRound,
        kind: "pool",
        groups: result.newGroups,
        createdAt: new Date(now),
      });
      for (const join of result.joins)
        await addToGroup(tx, eventId, ev.currentRound, join.groupId, join.group);
    });
    return true;
  }

  // -------------------------------------------------------------------------
  // Bestätigung
  // -------------------------------------------------------------------------

  /** Die Person hat einen Code gewählt (aus den Optionen oder eingetippt). */
  confirmCode(
    eventId: string,
    input: { participantId: string; matchId: string; code: string },
  ): Promise<ConfirmCodeResult> {
    return this.run(eventId, async () => {
      const { db, clock } = this.deps;
      const ev = await loadLiveEvent(db, eventId);
      if (!ev) throw notFound("event_not_found");
      const result = await db.transaction((tx) => submitCode(tx, ev, { ...input, now: clock.now() }));
      await this.broadcast(eventId);
      const state = await this.participantState(input.participantId, eventId);
      return { result, state: state! };
    });
  }

  /** „Nicht gefunden“: raus aus dem Match und gleich nach einem neuen suchen. */
  giveUp(eventId: string, input: { participantId: string; matchId: string }): Promise<ParticipantLive> {
    return this.run(eventId, async () => {
      const { db, clock } = this.deps;
      const ev = await loadLiveEvent(db, eventId);
      if (!ev) throw notFound("event_not_found");
      await db.transaction((tx) => giveUpMatch(tx, ev, { ...input, now: clock.now() }));
      await this.matchWaiting(eventId);
      await this.broadcast(eventId);
      return (await this.participantState(input.participantId, eventId))!;
    });
  }

  /**
   * Nach Austritt oder Entfernen einer Person: Matches ohne Gegenüber auflösen, Ringe in
   * Dreiergruppen schließen und Zurückgebliebene ohne Wartezeit in den Pool setzen.
   */
  participantChanged(eventId: string): Promise<void> {
    return this.run(eventId, async () => {
      await this.repairGroups(eventId);
      await this.broadcast(eventId);
    });
  }

  /**
   * Eingriff der Moderation: Selfie zurücksetzen (die Person muss neu fotografieren) oder die
   * Person entfernen. Offene Matches der Person lösen sich auf; gibt den alten Selfie-Schlüssel
   * zurück, damit das Bild gelöscht werden kann.
   */
  moderate(
    eventId: string,
    participantId: string,
    action: "reset_selfie" | "remove",
  ): Promise<{ selfieKey: string | null }> {
    return this.run(eventId, async () => {
      const { db } = this.deps;
      const ev = await loadLiveEvent(db, eventId);
      const [row] = await db
        .select({ selfieKey: participant.selfieKey, status: participant.status })
        .from(participant)
        .where(and(eq(participant.id, participantId), eq(participant.eventId, eventId)));
      if (!ev || !row || row.status === "removed") throw notFound("participant_not_found");

      await db.transaction(async (tx) => {
        const roundRow = await currentRoundRow(tx, ev);
        const open = (await loadRoundGroups(tx, roundRow?.id ?? null)).filter(
          (g) => g.status === "open" && g.members.some((m) => m.participantId === participantId),
        );
        if (open.length > 0) {
          await tx.delete(matchMember).where(
            and(
              inArray(
                matchMember.matchGroupId,
                open.map((g) => g.id),
              ),
              eq(matchMember.participantId, participantId),
            ),
          );
        }
        await tx
          .update(participant)
          .set({ status: action === "remove" ? "removed" : "onboarding", selfieKey: null, poolSince: null })
          .where(eq(participant.id, participantId));
      });
      await this.repairGroups(eventId);
      if (action === "remove") this.invalidate(participantId, "removed");
      await this.broadcast(eventId);
      return { selfieKey: row.selfieKey };
    });
  }

  private async repairGroups(eventId: string) {
    const { db, clock } = this.deps;
    const ev = await loadLiveEvent(db, eventId);
    if (!ev) return;
    const roundRow = await currentRoundRow(db, ev);
    const groups = (await loadRoundGroups(db, roundRow?.id ?? null)).filter((g) => g.status !== "expired");
    const backToPool = new Set<string>();

    await db.transaction(async (tx) => {
      for (const g of groups) {
        const ids = g.members.map((m) => m.participantId);
        if (g.status === "open" && ids.length < 2) {
          await tx.update(matchGroup).set({ status: "expired" }).where(eq(matchGroup.id, g.id));
          ids.forEach((id) => backToPool.add(id));
        } else if (g.status === "open" && g.members.some((m) => !ids.includes(m.confirmsParticipantId))) {
          await rewriteMembers(tx, g.id, ids, g.similarity);
          // Wer übrig ist, hat sich vielleicht schon gegenseitig bestätigt.
          await completeIfConfirmed(tx, g.id, new Date(clock.now()));
        }
      }
      // Wer „matched“ ist, aber in keiner Gruppe mehr steckt (Mitgliedschaft per Cascade gelöscht).
      const inGroup = new Set(
        groups.filter((g) => g.members.length >= 2).flatMap((g) => g.members.map((m) => m.participantId)),
      );
      const matched = await tx
        .select({ id: participant.id })
        .from(participant)
        .where(and(eq(participant.eventId, eventId), eq(participant.status, "matched")));
      matched.filter((p) => !inGroup.has(p.id)).forEach((p) => backToPool.add(p.id));

      if (backToPool.size > 0) {
        // Sie haben schon gewartet: sofort wieder vermittelbar.
        const poolSince = new Date(clock.now() - ev.firstMatchDelayS * 1000);
        await tx
          .update(participant)
          .set({ status: "pool", poolSince })
          .where(and(inArray(participant.id, [...backToPool]), eq(participant.status, "matched")));
      }
    });
  }

  // -------------------------------------------------------------------------
  // Verbindungen
  // -------------------------------------------------------------------------

  private connectedIds(): ReadonlySet<string> {
    return new Set(this.connections.keys());
  }

  /** Ein Handy hat sich verbunden. Wer inaktiv war, kommt zurück in den Pool. */
  connect(participantId: string, eventId: string): Promise<void> {
    const entry = this.connections.get(participantId) ?? { eventId, count: 0 };
    entry.count++;
    this.connections.set(participantId, entry);

    return this.run(eventId, async () => {
      const { db, clock } = this.deps;
      const now = new Date(clock.now());
      const [row] = await db
        .update(participant)
        .set({ lastSeenAt: now })
        .where(eq(participant.id, participantId))
        .returning({ status: participant.status });
      if (row?.status === "inactive") {
        await db
          .update(participant)
          .set({ status: "pool", poolSince: now })
          .where(eq(participant.id, participantId));
        await this.broadcast(eventId);
      } else {
        await this.sendParticipantState(eventId, participantId);
        this.scheduleEventState(eventId);
      }
    });
  }

  disconnect(participantId: string, eventId: string): Promise<void> {
    const entry = this.connections.get(participantId);
    if (entry && --entry.count <= 0) this.connections.delete(participantId);
    if (this.connections.has(participantId)) return Promise.resolve();
    this.lastSent.delete(participantId);

    return this.run(eventId, async () => {
      await this.deps.db
        .update(participant)
        .set({ lastSeenAt: new Date(this.deps.clock.now()) })
        .where(eq(participant.id, participantId));
      this.scheduleEventState(eventId);
    });
  }

  /** Alle Tabs der Person abmelden (nach „Ich steige aus“ oder Entfernen durch die Moderation). */
  invalidate(participantId: string, reason: SessionEndReason = "unknown") {
    this.emitter.invalidate(participantId, reason);
  }

  /** Verbunden oder erst seit Kurzem weg (für die Moderationsansicht). */
  isPresent(p: { id: string; lastSeenAt: Date }) {
    return isPresent(p, this.connectedIds(), this.deps.clock.now());
  }

  // -------------------------------------------------------------------------
  // Zustand senden
  // -------------------------------------------------------------------------

  async participantState(participantId: string, eventId: string): Promise<ParticipantLive | null> {
    const snapshot = await loadSnapshot(this.deps.db, eventId);
    if (!snapshot) return null;
    return buildParticipantLive(snapshot, participantId, {
      connected: this.connectedIds(),
      now: this.deps.clock.now(),
      media: this.deps.media,
    });
  }

  async eventState(eventId: string): Promise<EventLive | null> {
    const snapshot = await loadSnapshot(this.deps.db, eventId);
    return snapshot
      ? buildEventLive(snapshot, {
          connected: this.connectedIds(),
          now: this.deps.clock.now(),
          media: this.deps.media,
        })
      : null;
  }

  private async sendParticipantState(eventId: string, participantId: string) {
    const state = await this.participantState(participantId, eventId);
    if (state) this.send(participantId, state, true);
  }

  /**
   * Schickt einem Handy seinen Zustand, aber nur, wenn sich etwas geändert hat. Sonst bekämen bei
   * jeder Bestätigung alle Handys denselben Zustand noch einmal (bei 200 Personen ~4 Nachrichten
   * pro Sekunde und Handy). Beim Verbinden immer senden.
   */
  private send(participantId: string, state: ParticipantLive, always = false) {
    const { serverNow: _serverNow, ...content } = state;
    const key = JSON.stringify(content);
    if (!always && this.lastSent.get(participantId) === key) return;
    this.lastSent.set(participantId, key);
    this.emitter.toParticipant(participantId, state);
  }

  /** Sendet allen verbundenen Handys des Events und Leinwand/Admins den aktuellen Zustand. */
  async broadcast(eventId: string) {
    const snapshot = await loadSnapshot(this.deps.db, eventId);
    if (!snapshot) return;
    const connected = this.connectedIds();
    const now = this.deps.clock.now();
    this.emitter.toEvent(eventId, buildEventLive(snapshot, { connected, now, media: this.deps.media }));
    for (const [participantId, entry] of this.connections) {
      if (entry.eventId !== eventId) continue;
      const state = buildParticipantLive(snapshot, participantId, { connected, now, media: this.deps.media });
      if (state) this.send(participantId, state);
    }
  }

  private scheduleEventState(eventId: string) {
    if (this.eventStateTimers.has(eventId)) return;
    this.eventStateTimers.set(
      eventId,
      this.deps.clock.setTimeout(() => {
        this.eventStateTimers.delete(eventId);
        this.fire(eventId, async () => {
          const state = await this.eventState(eventId);
          if (state) this.emitter.toEvent(eventId, state);
        });
      }, EVENT_STATE_DEBOUNCE_MS),
    );
  }
}
