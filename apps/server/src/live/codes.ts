import { randomInt } from "node:crypto";

export interface MemberCode {
  participantId: string;
  ownCode: string;
  /** Wessen Code diese Person auswählen muss (Ring A→B→C→A, bei Paaren gegenseitig). */
  confirmsParticipantId: string;
}

/**
 * Vergibt je Person einen dreistelligen Code, innerhalb der Gruppe verschieden.
 * Vorläufig; Format und Köder-Codes kommen mit dem Match-Screen (M5).
 */
export function assignCodes(
  memberIds: readonly string[],
  existing: ReadonlyMap<string, string> = new Map(),
): MemberCode[] {
  const used = new Set<string>();
  const codes = memberIds.map((id) => {
    let code = existing.get(id);
    while (!code || used.has(code)) code = String(randomInt(100, 1000));
    used.add(code);
    return code;
  });
  return memberIds.map((id, i) => ({
    participantId: id,
    ownCode: codes[i]!,
    confirmsParticipantId: memberIds[(i + 1) % memberIds.length]!,
  }));
}
