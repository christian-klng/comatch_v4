import { SELFIE_MAX_DIMENSION } from "@comatch/shared";

/** Hochformat 3:4, damit neben dem Gesicht auch etwas vom Outfit zu sehen ist. */
export const SELFIE_ASPECT = 3 / 4;
const QUALITY = 0.85;

/**
 * Schneidet ein Bild mittig auf 3:4 zu, verkleinert es und kodiert es als JPEG.
 * Das Neu-Kodieren entfernt nebenbei Metadaten wie den Aufnahmeort.
 */
export async function toSelfieBlob(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): Promise<Blob> {
  let cropW = sourceWidth;
  let cropH = sourceWidth / SELFIE_ASPECT;
  if (cropH > sourceHeight) {
    cropH = sourceHeight;
    cropW = sourceHeight * SELFIE_ASPECT;
  }
  const scale = Math.min(1, SELFIE_MAX_DIMENSION / cropH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropW * scale);
  canvas.height = Math.round(cropH * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nicht verfügbar");
  ctx.drawImage(
    source,
    (sourceWidth - cropW) / 2,
    (sourceHeight - cropH) / 2,
    cropW,
    cropH,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Foto konnte nicht erstellt werden"))),
      "image/jpeg",
      QUALITY,
    ),
  );
}

/** Für den Fallback per Datei-Auswahl; createImageBitmap berücksichtigt die EXIF-Drehung. */
export async function fileToSelfieBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    return await toSelfieBlob(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
