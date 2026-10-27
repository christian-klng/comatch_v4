import { describe, expect, it } from "vitest";
import { estimateClockOffset, remainingMs } from "./time.ts";

describe("estimateClockOffset", () => {
  it("rechnet die halbe Roundtrip-Zeit ein", () => {
    // Client sendet bei 1000, empfängt bei 1100; Server meldet 5050 (Mitte des Roundtrips).
    expect(estimateClockOffset(1000, 1100, 5050)).toBe(4000);
  });
});

describe("remainingMs", () => {
  it("berücksichtigt den Offset und wird nie negativ", () => {
    expect(remainingMs(10_000, 4_000, 1_000)).toBe(5_000);
    expect(remainingMs(10_000, 20_000, 0)).toBe(0);
  });
});
