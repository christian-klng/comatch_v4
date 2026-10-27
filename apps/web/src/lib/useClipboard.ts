import { useCallback, useState } from "react";

/** Kopiert Text und meldet für kurze Zeit „kopiert“. */
export function useClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied((current) => (current === text ? null : current)), resetMs);
    },
    [resetMs],
  );
  return { copy, copied };
}
