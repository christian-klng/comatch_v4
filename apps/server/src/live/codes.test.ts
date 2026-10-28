import { describe, expect, it } from "vitest";
import { assignCodes, codeOptions, makeDecoys, type CodeState } from "./codes.ts";

const VALID = /^[1-9]\d\d$/;
const distinctDigits = (code: string) => new Set(code).size === code.length;

function expectValidGroup(members: ReturnType<typeof assignCodes>) {
  const codes = members.map((m) => m.ownCode);
  expect(new Set(codes).size).toBe(members.length);
  for (const m of members) {
    expect(m.ownCode).toMatch(VALID);
    expect(distinctDigits(m.ownCode)).toBe(true);
    expect(m.decoyCodes).toHaveLength(2);
    expect(new Set(m.decoyCodes).size).toBe(2);
    // Kein Köder darf ein echter Code der Gruppe sein.
    for (const decoy of m.decoyCodes) {
      expect(codes).not.toContain(decoy);
      expect(decoy).toMatch(VALID);
    }
  }
}

const asExisting = (members: ReturnType<typeof assignCodes>) =>
  new Map<string, CodeState>(members.map((m) => [m.participantId, m]));

describe("assignCodes", () => {
  it("lässt sich Paare gegenseitig bestätigen", () => {
    const members = assignCodes(["a", "b"]);
    expectValidGroup(members);
    expect(Object.fromEntries(members.map((m) => [m.participantId, m.confirmsParticipantId]))).toEqual({
      a: "b",
      b: "a",
    });
  });

  it("bildet in Dreiergruppen einen Ring", () => {
    for (let i = 0; i < 50; i++) {
      const members = assignCodes(["a", "b", "c"]);
      expectValidGroup(members);
      expect(new Set(members.map((m) => m.confirmsParticipantId)).size).toBe(3);
      expect(members.every((m) => m.confirmsParticipantId !== m.participantId)).toBe(true);
    }
  });

  it("behält Codes und Ziele, wenn eine dritte Person dazukommt", () => {
    const pair = assignCodes(["a", "b"]);
    const triple = assignCodes(["b", "a", "c"], asExisting(pair));
    expectValidGroup(triple);
    const byId = new Map(triple.map((m) => [m.participantId, m]));
    for (const m of pair) expect(byId.get(m.participantId)!.ownCode).toBe(m.ownCode);
    // Genau eine der beiden bisherigen Personen behält ihr Ziel samt Ködern.
    const kept = triple.filter((m) => m.kept);
    expect(kept).toHaveLength(1);
    const before = pair.find((m) => m.participantId === kept[0]!.participantId)!;
    expect(kept[0]).toMatchObject({
      confirmsParticipantId: before.confirmsParticipantId,
      decoyCodes: before.decoyCodes,
    });
  });

  it("schließt den Ring neu, wenn jemand die Dreiergruppe verlässt", () => {
    const triple = assignCodes(["a", "b", "c"]);
    const leaving = triple[1]!.participantId;
    const rest = triple.map((m) => m.participantId).filter((id) => id !== leaving);
    const existing = asExisting(triple);
    existing.delete(leaving);
    const pair = assignCodes(rest, existing);
    expectValidGroup(pair);
    expect(pair.map((m) => m.confirmsParticipantId).sort()).toEqual([...rest].reverse().sort());
    // Wer vorher nicht die gegangene Person bestätigen musste, behält seinen Stand.
    const unaffected = triple.find(
      (m) => m.participantId !== leaving && m.confirmsParticipantId !== leaving,
    )!;
    expect(pair.find((m) => m.participantId === unaffected.participantId)!.kept).toBe(true);
  });
});

describe("makeDecoys", () => {
  it("wählt einen Köder mit vertauschten Ziffern und einen mit einer anderen Ziffer", () => {
    for (let i = 0; i < 50; i++) {
      const [swapped, changed] = makeDecoys("472", new Set(["472"]));
      expect([...swapped!].sort().join()).toBe([..."472"].sort().join());
      expect(swapped).not.toBe("472");
      const differing = [...changed!].filter((c, j) => c !== "472"[j]).length;
      expect(differing).toBe(1);
    }
  });

  it("meidet belegte Codes", () => {
    const taken = new Set(["123", "132", "213", "231", "312", "321"]);
    for (let i = 0; i < 20; i++) {
      for (const decoy of makeDecoys("123", taken)) expect(taken.has(decoy)).toBe(false);
    }
  });
});

describe("codeOptions", () => {
  it("bleibt stabil und mischt nach jedem Fehlversuch neu", () => {
    const first = codeOptions("g", "p", "472", ["427", "482"], 0);
    expect([...first].sort()).toEqual(["427", "472", "482"]);
    expect(codeOptions("g", "p", "472", ["427", "482"], 0)).toEqual(first);
    let previous = first;
    for (let n = 1; n < 6; n++) {
      const next = codeOptions("g", "p", "472", ["427", "482"], n);
      expect(next).not.toEqual(previous);
      previous = next;
    }
  });
});
