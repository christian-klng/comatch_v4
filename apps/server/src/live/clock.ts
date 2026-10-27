/** Zeit und Timer, austauschbar, damit Tests Runden ohne Warten durchspielen können. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

interface ManualTask {
  id: number;
  at: number;
  fn: () => void;
  every?: number;
}

/** Uhr für Tests: Zeit läuft nur mit advance(); fällige Timer laufen dabei in zeitlicher Reihenfolge. */
export function createManualClock(start = Date.now()) {
  let now = start;
  let nextId = 1;
  const tasks = new Map<number, ManualTask>();

  const add = (fn: () => void, ms: number, every?: number) => {
    const id = nextId++;
    tasks.set(id, { id, at: now + Math.max(0, ms), fn, every });
    return id;
  };
  const remove = (handle: unknown) => void tasks.delete(handle as number);

  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => add(fn, ms),
    clearTimeout: remove,
    setInterval: (fn: () => void, ms: number) => add(fn, ms, ms),
    clearInterval: remove,

    /** Spult die Zeit vor und führt fällige Timer aus. `settle` wartet nach jedem Timer (z. B. auf DB-Arbeit). */
    async advance(ms: number, settle: () => Promise<void> = async () => {}) {
      const target = now + ms;
      for (;;) {
        const due = [...tasks.values()]
          .filter((t) => t.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = due.at;
        if (due.every) due.at += due.every;
        else tasks.delete(due.id);
        due.fn();
        await settle();
      }
      now = target;
    },

    pending: () => tasks.size,
  } satisfies Clock & Record<string, unknown>;
}

export type ManualClock = ReturnType<typeof createManualClock>;
