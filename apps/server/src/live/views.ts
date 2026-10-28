import {
  INACTIVE_AFTER_MS,
  MAX_CODE_CHOICES_ATTEMPTS,
  NOT_FOUND_MIN_SEARCH_MS,
  WRONG_CODE_LOCK_MS,
  type CommonGround,
  type EventLive,
  type LiveClock,
  type ParticipantLive,
  type ParticipantMatch,
} from "@comatch/shared";
import type { MediaSigner } from "../lib/media.ts";
import { questionMatches } from "../matching/index.ts";
import { codeOptions } from "./codes.ts";
import type { GroupView, LiveEventRow, LiveSnapshot, ParticipantRow } from "./repository.ts";

/** Fragen und Selfie erledigt, noch dabei. */
export const hasJoined = (p: Pick<ParticipantRow, "status">) =>
  p.status !== "onboarding" && p.status !== "removed";

/** Verbunden oder erst seit Kurzem weg (z. B. Handy kurz gesperrt). */
export function isPresent(
  p: Pick<ParticipantRow, "id" | "lastSeenAt">,
  connected: ReadonlySet<string>,
  now: number,
) {
  return connected.has(p.id) || now - p.lastSeenAt.getTime() < INACTIVE_AFTER_MS;
}

export function toClock(ev: LiveEventRow): LiveClock {
  return {
    status: ev.status,
    round: ev.currentRound,
    roundEndsAt: ev.roundEndsAt?.getTime() ?? null,
    pausedRemainingMs: ev.pausedRemainingMs,
    roundDurationS: ev.roundDurationS,
  };
}

export function buildEventLive(
  snapshot: LiveSnapshot,
  connected: ReadonlySet<string>,
  now: number,
): EventLive {
  const joined = snapshot.participants.filter(hasJoined);
  const active = joined.filter((p) => p.status !== "inactive" && isPresent(p, connected, now));
  const count = (status: ParticipantRow["status"]) => active.filter((p) => p.status === status).length;
  return {
    serverNow: now,
    clock: toClock(snapshot.event),
    counts: {
      joined: joined.length,
      active: active.length,
      waiting: count("pool"),
      matched: count("matched"),
      confirmed: count("confirmed"),
      inactive: joined.length - active.length,
    },
    matches: {
      open: snapshot.groups.filter((g) => g.status === "open").length,
      confirmed: snapshot.groups.filter((g) => g.status === "confirmed").length,
    },
  };
}

/** Fragen, bei denen zwei Personen zusammenpassen, als Gesprächseinstieg. */
export function commonGround(snapshot: LiveSnapshot, a: string, b: string): CommonGround[] {
  const own = snapshot.answers.get(a) ?? {};
  const other = snapshot.answers.get(b) ?? {};
  return snapshot.questions.flatMap((q) => {
    const x = own[q.id];
    const y = other[q.id];
    if (!x || !y || !questionMatches(q, x, y)) return [];
    return [
      {
        question: q.text,
        kind: q.matchMode === "same" ? ("same" as const) : ("complement" as const),
        own: q.labels.get(x) ?? "",
        partner: q.labels.get(y) ?? "",
      },
    ];
  });
}

/**
 * Ab wann „Nicht gefunden“ geht: ab Rundenmitte und nach einer Minute Suche. Danach lohnt ein
 * neues Match nur, wenn die Runde noch lange genug läuft; sonst geht es in der nächsten weiter.
 */
export function notFoundFrom(ev: LiveEventRow, group: Pick<GroupView, "createdAt">): number | null {
  if (ev.status !== "running" || !ev.roundEndsAt) return null;
  const end = ev.roundEndsAt.getTime();
  return Math.max(end - (ev.roundDurationS * 1000) / 2, group.createdAt.getTime() + NOT_FOUND_MIN_SEARCH_MS);
}

function buildMatch(
  snapshot: LiveSnapshot,
  group: GroupView,
  participantId: string,
  ctx: { now: number; media: MediaSigner },
): ParticipantMatch | null {
  const own = group.members.find((m) => m.participantId === participantId);
  const target = group.members.find((m) => m.participantId === own?.confirmsParticipantId);
  if (!own || !target) return null;
  const byId = new Map(snapshot.participants.map((p) => [p.id, p]));
  const lockedUntil = own.lastWrongAt ? own.lastWrongAt.getTime() + WRONG_CODE_LOCK_MS : null;

  return {
    id: group.id,
    kind: group.kind,
    status: group.status === "confirmed" ? "confirmed" : "open",
    ownCode: own.ownCode,
    similarity: group.similarity,
    partners: group.members
      .filter((m) => m.participantId !== participantId)
      .map((m) => {
        const key = byId.get(m.participantId)?.selfieKey;
        return {
          id: m.participantId,
          selfieUrl: key ? ctx.media.url(key, ctx.now) : null,
          commonGround: commonGround(snapshot, participantId, m.participantId),
          confirmedMe: m.confirmsParticipantId === participantId && m.confirmedAt !== null,
        };
      }),
    confirm: {
      targetId: target.participantId,
      options:
        own.wrongAttempts >= MAX_CODE_CHOICES_ATTEMPTS
          ? null
          : codeOptions(group.id, participantId, target.ownCode, own.decoyCodes, own.wrongAttempts),
      wrongAttempts: own.wrongAttempts,
      lockedUntil: lockedUntil !== null && lockedUntil > ctx.now ? lockedUntil : null,
      confirmed: own.confirmedAt !== null,
    },
    notFoundFrom: group.status === "open" && !own.confirmedAt ? notFoundFrom(snapshot.event, group) : null,
  };
}

export function buildParticipantLive(
  snapshot: LiveSnapshot,
  participantId: string,
  ctx: { connected: ReadonlySet<string>; now: number; media: MediaSigner },
): ParticipantLive | null {
  const me = snapshot.participants.find((p) => p.id === participantId);
  if (!me) return null;
  const group = snapshot.groups.find(
    (g) => g.status !== "expired" && g.members.some((m) => m.participantId === participantId),
  );
  const ended = snapshot.groups.some(
    (g) => g.status === "expired" && g.members.some((m) => m.participantId === participantId),
  );

  return {
    serverNow: ctx.now,
    clock: toClock(snapshot.event),
    status: me.status,
    activeParticipants: snapshot.participants.filter(
      (p) => hasJoined(p) && p.status !== "inactive" && isPresent(p, ctx.connected, ctx.now),
    ).length,
    match: group ? buildMatch(snapshot, group, participantId, ctx) : null,
    previousMatchEnded: !group && ended,
  };
}
