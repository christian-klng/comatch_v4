import { useEffect, useState } from "react";
import type { LegalInfo } from "@comatch/shared";
import { api } from "./api.ts";

let cached: Promise<LegalInfo> | null = null;

/** Betreiber-Angaben und Löschfrist (einmal je Seitenaufruf geladen). */
export function useLegal(): LegalInfo | null {
  const [info, setInfo] = useState<LegalInfo | null>(null);
  useEffect(() => {
    cached ??= api<LegalInfo>("/legal").catch((err: unknown) => {
      cached = null;
      throw err;
    });
    let active = true;
    cached.then((data) => active && setInfo(data)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return info;
}
