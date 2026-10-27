import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Spinner, cx } from "../../components/ui.tsx";
import { fileToSelfieBlob, toSelfieBlob } from "../../lib/selfie.ts";
import { PrimaryButton, SecondaryButton } from "./parts.tsx";

type CameraState = "starting" | "live" | "unavailable";

/** Startet die Frontkamera; ohne Kamera, ohne Erlaubnis oder ohne HTTPS gibt es den Datei-Fallback. */
function useFrontCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const supported = typeof navigator.mediaDevices?.getUserMedia === "function";
  const [state, setState] = useState<CameraState>(supported ? "starting" : "unavailable");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (!supported) return;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        setState("live");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef, supported]);

  return state;
}

/** Hält das aufgenommene Foto samt Vorschau-URL; alte URLs werden freigegeben. */
function usePhoto() {
  const [photo, setPhotoState] = useState<{ blob: Blob; url: string } | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const setPhoto = (blob: Blob | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = blob ? URL.createObjectURL(blob) : null;
    setPhotoState(blob && urlRef.current ? { blob, url: urlRef.current } : null);
  };
  return [photo, setPhoto] as const;
}

export function SelfieStep({
  needsConsent,
  busy,
  error,
  onSubmit,
  onBack,
}: {
  /** false, wenn die Einwilligung schon beim Beitritt erteilt wurde (z. B. neues Selfie). */
  needsConsent: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (photo: Blob) => void;
  onBack?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camera = useFrontCamera(videoRef);
  const [photo, setPhoto] = usePhoto();
  const [consent, setConsent] = useState(!needsConsent);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    try {
      setPhoto(await toSelfieBlob(video, video.videoWidth, video.videoHeight));
      setCaptureError(null);
    } catch {
      setCaptureError("Das Foto hat nicht geklappt. Bitte noch einmal versuchen.");
    }
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await fileToSelfieBlob(file));
      setCaptureError(null);
    } catch {
      setCaptureError("Dieses Bild kann ich nicht lesen. Bitte ein anderes Foto wählen.");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold">Zeig dich!</h2>
        <p className="mt-1 text-slate-400">An deinem Selfie erkennt dich dein Match im Raum.</p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
          {["Gesicht gut sichtbar", "Keine Sonnenbrille", "Gern etwas vom Outfit"].map((tip) => (
            <li key={tip} className="rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
              {tip}
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cx(
          "relative mx-auto aspect-[3/4] w-full overflow-hidden rounded-3xl bg-slate-900 ring-1 ring-white/10",
          // Mit Einwilligungstext kleiner, damit die Buttons ohne Scrollen sichtbar bleiben.
          photo && needsConsent ? "max-w-52" : "max-w-xs",
        )}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Kamera-Vorschau"
          className={`size-full -scale-x-100 object-cover ${photo || camera !== "live" ? "hidden" : ""}`}
        />
        {photo && <img src={photo.url} alt="Dein Selfie" className="size-full object-cover" />}
        {!photo && camera === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <Spinner />
          </div>
        )}
        {!photo && camera === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-slate-300">
            <span className="text-5xl" aria-hidden>
              🤳
            </span>
            <p>
              Die Kamera lässt sich hier nicht direkt öffnen. Mach das Foto einfach mit deiner Kamera-App.
            </p>
          </div>
        )}
      </div>

      {(captureError ?? error) && (
        <p role="alert" className="rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          {captureError ?? error}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // Ohne Live-Kamera direkt die Kamera-App öffnen, sonst darf auch die Galerie gewählt werden.
        capture={camera === "unavailable" ? "user" : undefined}
        className="hidden"
        onChange={(e) => void pickFile(e)}
      />

      <div className="mt-auto flex flex-col gap-3">
        {photo ? (
          <>
            {needsConsent && (
              <label className="flex items-start gap-3 rounded-xl bg-white/5 p-4 text-sm text-slate-300 ring-1 ring-white/10">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-brand"
                />
                <span>
                  Ich bin einverstanden, dass mein Foto für dieses Event gespeichert und meinen Matches sowie
                  auf der Leinwand gezeigt wird. Es wird nach dem Event gelöscht. Ich kann jederzeit
                  aussteigen, dann wird es sofort gelöscht.
                </span>
              </label>
            )}
            <PrimaryButton disabled={!consent} busy={busy} onClick={() => onSubmit(photo.blob)}>
              Foto verwenden
            </PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => setPhoto(null)}>
              Nochmal
            </SecondaryButton>
          </>
        ) : camera === "live" ? (
          <>
            <PrimaryButton onClick={() => void capture()}>Foto aufnehmen</PrimaryButton>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-slate-400 underline-offset-4 hover:underline"
            >
              Lieber ein Foto aus der Galerie wählen
            </button>
          </>
        ) : (
          <PrimaryButton disabled={camera === "starting"} onClick={() => fileRef.current?.click()}>
            Kamera öffnen
          </PrimaryButton>
        )}
        {onBack && !photo && (
          <SecondaryButton disabled={busy} onClick={onBack}>
            Zurück
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
