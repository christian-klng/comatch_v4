// Typen für die Socket.IO-Verbindung. Werden in späteren Meilensteinen erweitert.

export interface ServerHello {
  /** Serverzeit in ms seit Epoch, zur Berechnung des Uhren-Offsets. */
  serverNow: number;
}

export interface ServerToClientEvents {
  hello: (payload: ServerHello) => void;
}

export interface ClientToServerEvents {
  /** Antwortet mit der aktuellen Serverzeit (für wiederholte Zeit-Synchronisation). */
  ping: (ack: (payload: ServerHello) => void) => void;
}
