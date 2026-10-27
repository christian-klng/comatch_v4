/**
 * Schätzt den Offset zwischen Server- und Client-Uhr aus einem Ping-Roundtrip.
 * Positiver Wert: Die Serveruhr geht gegenüber dem Client vor.
 */
export function estimateClockOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  const roundTrip = receivedAt - sentAt;
  return serverNow + roundTrip / 2 - receivedAt;
}

/** Verbleibende Millisekunden bis `endsAt` (Serverzeit), nie negativ. */
export function remainingMs(endsAt: number, clientNow: number, offset: number): number {
  return Math.max(0, endsAt - (clientNow + offset));
}
