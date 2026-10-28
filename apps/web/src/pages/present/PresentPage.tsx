import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import type { EventLive, PresenterEvent } from "@comatch/shared";
import { QrCode } from "../../components/QrCode.tsx";
import { cx } from "../../components/ui.tsx";
import { api } from "../../lib/api.ts";
import { formatCountdown, useLive, useRemaining } from "../../lib/live.ts";
import { useWakeLock } from "../../lib/wakeLock.ts";
import { MatchStage } from "./MatchStage.tsx";

const DEFAULT_COLOR = "#6366f1";
/** So lange steht „Runde X“ nach einem Rundenwechsel groß auf der Leinwand. */
const BANNER_MS = 4_000;
/** Ab hier wird der Countdown betont. */
const FINAL_SECONDS_MS = 10_000;

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

/** Zeigt nach einem Rundenwechsel kurz die neue Runde (nicht beim Öffnen der Seite). */
function useRoundBanner(round: number | undefined) {
  const previous = useRef<number | null>(null);
  const [banner, setBanner] = useState<number | null>(null);
  useEffect(() => {
    if (round === undefined) return;
    const before = previous.current;
    previous.current = round;
    if (before === null || round <= before) return;
    const show = setTimeout(() => setBanner(round), 0);
    const hide = setTimeout(() => setBanner(null), BANNER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [round]);
  return banner;
}

function FullscreenButton() {
  const [fullscreen, setFullscreen] = useState(() => document.fullscreenElement !== null);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (fullscreen || !document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}
      className="absolute top-4 right-4 z-30 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-300 opacity-40 transition hover:opacity-100"
    >
      Vollbild
    </button>
  );
}

function Header({ info, right }: { info: PresenterEvent; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-[2vw]">
      <div className="flex min-w-0 items-center gap-[1.5vw]">
        {info.logoUrl && <img src={info.logoUrl} alt="" className="h-[6vh] max-w-[20vw] object-contain" />}
        <p className="truncate text-[3vh] font-semibold text-slate-300">{info.title}</p>
      </div>
      {right}
    </header>
  );
}

function QrBox({ url, size }: { url: string; size: string }) {
  return (
    <div className="rounded-[2vh] bg-white p-[1.2vh]" style={{ width: size, height: size }}>
      <QrCode value={url} className="size-full [&>svg]:size-full" />
    </div>
  );
}

function Lobby({ info, state }: { info: PresenterEvent; state: EventLive | null }) {
  const open = state?.clock.status === "open";
  const joined = state?.counts.joined ?? 0;
  return (
    <div className="grid flex-1 grid-cols-[auto_1fr] items-center gap-[5vw]">
      <div className="flex flex-col items-center gap-[2.5vh]">
        {open ? (
          <>
            <QrBox url={info.joinUrl} size="52vh" />
            <p className="font-mono text-[3.6vh] font-semibold tracking-wide">{shortUrl(info.joinUrl)}</p>
          </>
        ) : (
          <div className="flex h-[52vh] w-[52vh] items-center justify-center rounded-[2vh] bg-white/5 p-[4vh] text-center text-[3.4vh] text-slate-400 ring-1 ring-white/10">
            Gleich öffnen wir den Beitritt.
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-[4vh]">
        <div>
          <h1 className="text-[8vh] leading-tight font-bold">{info.title}</h1>
          <p className="mt-[1vh] text-[3.6vh] text-slate-300">
            {open
              ? "QR-Code scannen, drei Fragen beantworten, Selfie machen. Fertig!"
              : "Gleich geht es los."}
          </p>
        </div>
        <p className="text-[4.5vh] text-slate-300">
          <span className="text-[12vh] leading-none font-bold text-brand tabular-nums">{joined}</span>{" "}
          {joined === 1 ? "Gründer*in ist dabei" : "Gründer*innen sind dabei"}
        </p>
        {state && state.selfies.length > 0 && (
          <div className="flex flex-wrap gap-[1.2vh]" aria-hidden>
            {state.selfies.map((url) => (
              <img
                key={url.split("?")[0]}
                src={url}
                alt=""
                className="h-[11vh] rounded-[1.2vh] object-cover opacity-80"
                style={{ aspectRatio: "3 / 4", animation: "fade-in-up 600ms ease-out both" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[7vh] leading-none font-bold tabular-nums">{value}</span>
      <span className="text-[2.4vh] text-slate-400">{label}</span>
    </div>
  );
}

function Rounds({
  info,
  state,
  remaining,
  color,
}: {
  info: PresenterEvent;
  state: EventLive;
  remaining: number | null;
  color: string;
}) {
  const paused = state.clock.status === "paused";
  const shown = paused ? state.clock.pausedRemainingMs : remaining;
  const final = !paused && remaining !== null && remaining <= FINAL_SECONDS_MS;
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="flex flex-col items-center">
        <p className="text-[3.4vh] tracking-wide text-slate-400 uppercase">
          {paused ? `Runde ${state.clock.round} · Pause` : `Runde ${state.clock.round} · nächste Runde in`}
        </p>
        <p
          className={cx(
            "text-[24vh] leading-none font-bold tabular-nums transition-colors",
            paused && "text-slate-500",
            final && "animate-pulse text-brand",
          )}
        >
          {formatCountdown(shown)}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        {paused ? (
          <div className="flex h-full items-center justify-center text-[5vh] font-semibold text-slate-300">
            ☕ Kurze Pause, gleich geht es weiter.
          </div>
        ) : (
          <MatchStage recent={state.recentConfirmed} color={color} />
        )}
      </div>

      <div className="flex items-end justify-between gap-[3vw]">
        <div className="flex gap-[5vw]">
          <Stat value={state.matches.confirmed} label="Matches in dieser Runde" />
          <Stat value={state.totals.confirmedMatches} label="Matches insgesamt" />
          <Stat value={state.counts.active} label="dabei" />
        </div>
        <div className="flex items-center gap-[1.5vw]">
          <p className="text-right text-[2.4vh] text-slate-400">
            Noch nicht dabei?
            <br />
            <span className="font-mono text-slate-200">{shortUrl(info.joinUrl)}</span>
          </p>
          <QrBox url={info.joinUrl} size="18vh" />
        </div>
      </div>
    </div>
  );
}

/** Größte Kachelbreite, mit der `count` Hochformat-Selfies (3:4) in die Fläche passen. */
function tileWidth(count: number, width: number, height: number, gap: number): number {
  let best = 0;
  for (let columns = 1; columns <= count; columns++) {
    const w = (width - gap * (columns - 1)) / columns;
    const rows = Math.ceil(count / columns);
    const h = Math.min((w * 4) / 3, (height - gap * (rows - 1)) / rows);
    best = Math.max(best, (h * 3) / 4);
  }
  return Math.floor(best);
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

function EndSlide({ state }: { state: EventLive }) {
  const { confirmedMatches, rounds } = state.totals;
  const [ref, size] = useSize();
  const gap = Math.round(size.height * 0.015);
  const width = tileWidth(state.selfies.length, size.width, size.height, gap);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-[3vh] text-center">
      <div>
        <h1 className="text-[9vh] leading-tight font-bold">Danke fürs Mitmachen! 🎉</h1>
        <p className="text-[4.5vh] text-slate-300">
          <span className="font-bold text-brand tabular-nums">{confirmedMatches}</span>{" "}
          {confirmedMatches === 1 ? "Match" : "Matches"} in{" "}
          <span className="font-bold tabular-nums">{rounds}</span> {rounds === 1 ? "Runde" : "Runden"}
        </p>
      </div>
      {/* Collage: Kachelgröße so, dass alle Selfies ohne Scrollen passen. */}
      <div
        ref={ref}
        className="flex min-h-0 w-full flex-1 flex-wrap content-center justify-center"
        style={{ gap }}
        aria-hidden
      >
        {width > 0 &&
          state.selfies.map((url, i) => (
            <img
              key={url.split("?")[0]}
              src={url}
              alt=""
              className="aspect-[3/4] rounded-[1vh] object-cover"
              style={{ width, animation: `fade-in-up 500ms ease-out ${Math.min(i * 40, 3000)}ms both` }}
            />
          ))}
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-slate-100">
      <h1 className="text-3xl font-semibold">{title}</h1>
      {children && <p className="max-w-lg text-slate-400">{children}</p>}
    </main>
  );
}

/**
 * Leinwand für den Beamer: Lobby mit QR-Code, Countdown mit Match-Animationen, Abschlussfolie.
 * Läuft ohne Login mit dem Presenter-Token aus dem Link.
 */
export function PresentPage() {
  const { eventId = "" } = useParams();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<PresenterEvent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<PresenterEvent>(`/present/${eventId}?token=${encodeURIComponent(token)}`)
      .then((data) => !cancelled && setInfo(data))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [eventId, token]);

  const live = useLive<EventLive>(info ? { role: "presenter", eventId, token } : null, "event_state");
  const state = live.data;
  const remaining = useRemaining(state?.clock.roundEndsAt ?? null, live.offsetMs);
  const banner = useRoundBanner(state?.clock.round);
  useWakeLock();

  if (failed || live.invalid) {
    return (
      <Notice title="Link ungültig">
        Bitte den aktuellen Präsentationslink aus der Moderation öffnen. Er ändert sich, wenn jemand ihn neu
        erzeugt.
      </Notice>
    );
  }
  if (!info) return <Notice title="Lade …" />;

  const color = info.primaryColor ?? DEFAULT_COLOR;
  const status = state?.clock.status;
  const style = { "--color-brand": color } as CSSProperties;

  return (
    <main
      style={style}
      className="relative flex h-dvh flex-col gap-[3vh] overflow-hidden bg-slate-950 px-[4vw] py-[4vh] text-white"
    >
      <FullscreenButton />
      <Header
        info={info}
        right={
          !live.connected &&
          state && <span className="text-[2.2vh] text-amber-300">Verbindung wird wiederhergestellt …</span>
        }
      />
      {status === "running" || status === "paused" ? (
        <Rounds info={info} state={state!} remaining={remaining} color={color} />
      ) : status === "ended" ? (
        <EndSlide state={state!} />
      ) : (
        <Lobby info={info} state={state} />
      )}

      {banner !== null && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-[3vh] bg-slate-950/90"
          style={{ animation: `banner ${BANNER_MS}ms ease-out both` }}
          role="status"
        >
          <p className="text-[16vh] leading-none font-bold text-brand">
            {banner === 1 ? "Los geht’s!" : `Runde ${banner}`}
          </p>
          <p className="text-[5vh] text-slate-200">Neue Matches! Schaut auf euer Handy 📱</p>
        </div>
      )}
    </main>
  );
}
