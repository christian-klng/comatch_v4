import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useServerClock } from "../lib/useServerClock.ts";

interface Health {
  status: string;
  db: string;
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  const color = ok === null ? "bg-slate-500" : ok ? "bg-emerald-400" : "bg-rose-500";
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg bg-slate-900 px-4 py-3">
      <span className="flex items-center gap-3">
        <span className={`size-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="text-sm text-slate-400">{detail}</span>
    </li>
  );
}

/** Entwicklungs-Startseite: zeigt, ob API, Datenbank und Echtzeitverbindung laufen. */
export function DevStatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const clock = useServerClock();

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-6 bg-slate-950 p-6 text-slate-100">
      <h1 className="text-3xl font-semibold">
        Co<span className="text-brand">Match</span>
        <span className="ml-2 align-middle text-sm font-normal text-slate-500">Dev-Status</span>
      </h1>
      <ul className="flex flex-col gap-2">
        <StatusRow
          label="API"
          ok={healthError ? false : health ? true : null}
          detail={healthError ? "nicht erreichbar" : (health?.status ?? "…")}
        />
        <StatusRow
          label="Datenbank"
          ok={healthError ? false : health ? health.db === "ok" : null}
          detail={health?.db ?? "…"}
        />
        <StatusRow
          label="Echtzeit (Socket.IO)"
          ok={clock.connected}
          detail={clock.offsetMs === null ? "verbinde …" : `Uhren-Offset ${clock.offsetMs} ms`}
        />
      </ul>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="text-brand underline" to="/admin">
          /admin
        </Link>
        <Link className="text-brand underline" to="/present/demo">
          /present/demo
        </Link>
        <Link className="text-brand underline" to="/e/demo">
          /e/demo
        </Link>
      </nav>
    </main>
  );
}
