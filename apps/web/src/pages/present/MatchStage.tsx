import confetti from "canvas-confetti";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ConfirmedMatch } from "@comatch/shared";

/** Dauer einer Animation: anfliegen, andocken, kurz zeigen, ausblenden. */
const PLAY_MS = 2_800;
/** Zeitpunkt des Andockens (Konfetti). */
const DOCK_MS = 1_100;
const GAP_MS = 300;
/** Bei vielen Bestätigungen kommen bis zu drei Matches gleichzeitig auf die Leinwand. */
const BATCH = 3;
/** So viele Matches der Runde bleiben klein stehen, solange nichts animiert wird. */
const IDLE_PAIRS = 6;

const pathOf = (url: string | null) => url?.split("?")[0] ?? "";

/**
 * Reiht neu bestätigte Matches ein und spielt sie nacheinander ab. Was beim Öffnen schon
 * bestätigt war, wird nicht nachgespielt.
 */
function useMatchQueue(recent: ConfirmedMatch[] | undefined) {
  const [playing, setPlaying] = useState<ConfirmedMatch[] | null>(null);
  const [queued, setQueued] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  const queue = useRef<ConfirmedMatch[]>([]);

  useEffect(() => {
    if (!recent) return;
    if (!seen.current) {
      seen.current = new Set(recent.map((m) => m.id));
      return;
    }
    const fresh = recent.filter((m) => !seen.current!.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seen.current!.add(m.id));
    queue.current.push(...fresh);
    setTimeout(() => setQueued(queue.current.length), 0);
  }, [recent]);

  useEffect(() => {
    if (playing || queue.current.length === 0) return;
    const start = setTimeout(() => {
      setPlaying(queue.current.splice(0, BATCH));
      setQueued(queue.current.length);
    }, GAP_MS);
    return () => clearTimeout(start);
  }, [playing, queued]);

  useEffect(() => {
    if (!playing) return;
    const end = setTimeout(() => setPlaying(null), PLAY_MS);
    return () => clearTimeout(end);
  }, [playing]);

  return playing;
}

function celebrate(color: string) {
  void confetti({
    particleCount: 90,
    spread: 80,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.55 },
    colors: [color, "#ffffff", "#fbbf24", "#34d399"],
    disableForReducedMotion: true,
  });
}

const FLIGHTS = ["fly-left", "fly-right", "fly-up"];
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Selfie({
  url,
  style,
  className,
}: {
  url: string | null;
  style?: CSSProperties;
  className?: string;
}) {
  return url ? (
    <img
      src={url}
      alt=""
      style={style}
      className={`aspect-[3/4] rounded-[1.5vh] object-cover ${className ?? ""}`}
    />
  ) : (
    <div style={style} className={`aspect-[3/4] rounded-[1.5vh] bg-white/10 ${className ?? ""}`} />
  );
}

function FlyingMatch({ match, height }: { match: ConfirmedMatch; height: string }) {
  return (
    <div
      className="flex items-center gap-[0.6vh] rounded-[2vh] p-[0.6vh]"
      style={{ animation: `dock-glow ${PLAY_MS}ms ease-out both` }}
    >
      {match.selfies.map((url, i) => (
        <Selfie
          key={`${pathOf(url)}${i}`}
          url={url}
          className="shadow-2xl"
          style={{
            height,
            animation: `${reducedMotion() ? "fade-hold" : (FLIGHTS[i] ?? "fly-up")} ${PLAY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
          }}
        />
      ))}
    </div>
  );
}

/** Bühne für bestätigte Matches: Animation, sonst die letzten Matches der Runde. */
export function MatchStage({ recent, color }: { recent: ConfirmedMatch[] | undefined; color: string }) {
  const playing = useMatchQueue(recent);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => celebrate(color), DOCK_MS);
    return () => clearTimeout(timer);
  }, [playing, color]);

  if (playing) {
    const height = playing.length === 1 ? "30vh" : playing.length === 2 ? "24vh" : "19vh";
    return (
      <div className="flex h-full items-center justify-center gap-[5vw]" aria-live="polite">
        <p className="sr-only">{playing.length === 1 ? "Neues Match!" : `${playing.length} neue Matches!`}</p>
        {playing.map((m) => (
          <FlyingMatch key={m.id} match={m} height={height} />
        ))}
      </div>
    );
  }

  const idle = (recent ?? []).slice(-IDLE_PAIRS).reverse();
  if (idle.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[3.2vh] text-slate-400">
          Findet euer Match und zeigt euch gegenseitig eure Codes!
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[2vh]">
      <p className="text-[2.4vh] tracking-wide text-slate-400 uppercase">Gerade gefunden</p>
      <div className="flex flex-wrap justify-center gap-[2.5vw]">
        {idle.map((m) => (
          <div
            key={m.id}
            className="flex gap-[0.5vh] rounded-[1.6vh] bg-white/5 p-[0.6vh] ring-1 ring-white/10"
          >
            {m.selfies.map((url, i) => (
              <Selfie key={`${pathOf(url)}${i}`} url={url} style={{ height: "14vh" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
