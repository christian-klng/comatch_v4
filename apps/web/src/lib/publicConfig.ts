import { useEffect, useState } from "react";
import type { PublicConfig } from "@comatch/shared";
import { api } from "./api.ts";

let cached: Promise<PublicConfig> | null = null;

/** Einstellungen, die die Oberfläche vor dem Login braucht (einmal je Seitenaufruf geladen). */
export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    cached ??= api<PublicConfig>("/config").catch((err: unknown) => {
      cached = null;
      throw err;
    });
    let active = true;
    cached.then((data) => active && setConfig(data)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return config;
}
