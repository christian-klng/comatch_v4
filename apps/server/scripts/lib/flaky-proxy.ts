// TCP-Proxy, der schwaches Event-WLAN nachstellt: jedes Datenpaket kommt verzögert an (Reihenfolge
// bleibt erhalten), und Verbindungen brechen ab und zu ab. Für den Lasttest mit --flaky.
import net from "node:net";

export interface FlakyOptions {
  target: { host: string; port: number };
  /** Verzögerung je Paket in ms, gleichverteilt zwischen min und max. */
  delayMs: [number, number];
  /** Wahrscheinlichkeit je Sekunde, dass eine Verbindung abreißt (sofern aktiviert). */
  dropPerSecond: number;
}

export interface FlakyProxy {
  port: number;
  /** Abbrüche ein- oder ausschalten (z. B. erst nach dem Beitritt). */
  setDropping(on: boolean): void;
  drops(): number;
  close(): Promise<void>;
}

/** Leitet Daten in Reihenfolge, aber verzögert weiter. */
function delayedPipe(from: net.Socket, to: net.Socket, delay: () => number) {
  let last = 0;
  from.on("data", (chunk) => {
    const at = Math.max(last, Date.now() + delay());
    last = at;
    setTimeout(() => {
      if (!to.destroyed) to.write(chunk);
    }, at - Date.now());
  });
}

export async function startFlakyProxy(options: FlakyOptions): Promise<FlakyProxy> {
  const [min, max] = options.delayMs;
  const delay = () => min + Math.random() * (max - min);
  const open = new Set<{ client: net.Socket; upstream: net.Socket }>();
  let dropping = false;
  let dropped = 0;

  const server = net.createServer((client) => {
    const upstream = net.connect(options.target.port, options.target.host);
    const pair = { client, upstream };
    open.add(pair);
    const close = () => {
      open.delete(pair);
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close).on("close", close);
    upstream.on("error", close).on("close", close);
    delayedPipe(client, upstream, delay);
    delayedPipe(upstream, client, delay);
  });

  const ticker = setInterval(() => {
    if (!dropping) return;
    for (const pair of open) {
      if (Math.random() < options.dropPerSecond) {
        dropped++;
        pair.client.destroy();
        pair.upstream.destroy();
        open.delete(pair);
      }
    }
  }, 1_000);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    setDropping: (on) => void (dropping = on),
    drops: () => dropped,
    close: () =>
      new Promise((resolve) => {
        clearInterval(ticker);
        for (const pair of open) {
          pair.client.destroy();
          pair.upstream.destroy();
        }
        server.close(() => resolve());
      }),
  };
}
