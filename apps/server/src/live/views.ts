import { INACTIVE_AFTER_MS, type EventLive, type LiveClock, type ParticipantLive } from "@comatch/shared";
import type { MediaSigner } from "../lib/media.ts";
import type { LiveEventRow, LiveSnapshot, ParticipantRow } from "./repository.ts";

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

export function buildParticipantLive(
  snapshot: LiveSnapshot,
  participantId: string,
  ctx: { connected: ReadonlySet<string>; now: number; media: MediaSigner },
): ParticipantLive | null {
  const me = snapshot.participants.find((p) => p.id === participantId);
  if (!me) return null;
  const byId = new Map(snapshot.participants.map((p) => [p.id, p]));
  const group = snapshot.groups.find(
    (g) => g.status !== "expired" && g.members.some((m) => m.participantId === participantId),
  );
  const own = group?.members.find((m) => m.participantId === participantId);

  return {
    serverNow: ctx.now,
    clock: toClock(snapshot.event),
    status: me.status,
    activeParticipants: snapshot.participants.filter(
      (p) => hasJoined(p) && p.status !== "inactive" && isPresent(p, ctx.connected, ctx.now),
    ).length,
    match:
      group && own
        ? {
            id: group.id,
            kind: group.kind,
            ownCode: own.ownCode,
            similarity: group.similarity,
            partners: group.members
              .filter((m) => m.participantId !== participantId)
              .map((m) => {
                const key = byId.get(m.participantId)?.selfieKey;
                return { id: m.participantId, selfieUrl: key ? ctx.media.url(key, ctx.now) : null };
              }),
          }
        : null,
  };
}
