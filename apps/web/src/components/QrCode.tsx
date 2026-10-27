import QRCode from "qrcode";
import { useEffect, useState } from "react";

// Hohe Fehlerkorrektur: bleibt auch auf Beamern mit Reflexionen gut scanbar.
const OPTIONS = { errorCorrectionLevel: "H", margin: 2 } as const;

export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { ...OPTIONS, type: "svg" }).then((result) => {
      if (!cancelled) setSvg(result);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={`QR-Code für ${value}`}
      className={className}
      // Das SVG stammt aus der qrcode-Bibliothek, nicht aus Nutzereingaben.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

function download(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
}

export async function downloadQrPng(value: string, filename: string) {
  download(await QRCode.toDataURL(value, { ...OPTIONS, width: 2048 }), filename);
}

export async function downloadQrSvg(value: string, filename: string) {
  const svg = await QRCode.toString(value, { ...OPTIONS, type: "svg" });
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  download(url, filename);
  URL.revokeObjectURL(url);
}
