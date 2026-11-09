import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Spinner, cx } from "../../components/ui.tsx";
import { LEGAL_PATHS, useLanguage, useT } from "../../i18n/index.tsx";
import { useLegal } from "../../lib/legal.ts";
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
  const legal = useLegal();
  const t = useT();
  const language = useLanguage();
  const [captureError, setCaptureError] = useState<string | null>(null);

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    try {
      setPhoto(await toSelfieBlob(video, video.videoWidth, video.videoHeight));
      setCaptureError(null);
    } catch {
      setCaptureError(t.selfie.captureFailed);
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
      setCaptureError(t.selfie.fileUnreadable);
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold">{t.selfie.title}</h2>
        <p className="mt-1 text-slate-400">{t.selfie.intro}</p>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
          {t.selfie.tips.map((tip) => (
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
          aria-label={t.selfie.cameraPreview}
          className={`size-full -scale-x-100 object-cover ${photo || camera !== "live" ? "hidden" : ""}`}
        />
        {photo && <img src={photo.url} alt={t.selfie.yourSelfie} className="size-full object-cover" />}
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
            <p>{t.selfie.cameraUnavailable}</p>
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
                  {t.selfie.consent(legal?.retentionHours ?? 24)}{" "}
                  <a
                    href={LEGAL_PATHS[language].privacy}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-100 underline"
                  >
                    {t.selfie.privacyPolicy}
                  </a>
                </span>
              </label>
            )}
            <PrimaryButton disabled={!consent} busy={busy} onClick={() => onSubmit(photo.blob)}>
              {t.selfie.usePhoto}
            </PrimaryButton>
            <SecondaryButton disabled={busy} onClick={() => setPhoto(null)}>
              {t.selfie.again}
            </SecondaryButton>
          </>
        ) : camera === "live" ? (
          <>
            <PrimaryButton onClick={() => void capture()}>{t.selfie.takePhoto}</PrimaryButton>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-sm text-slate-400 underline-offset-4 hover:underline"
            >
              {t.selfie.pickFromGallery}
            </button>
          </>
        ) : (
          <PrimaryButton disabled={camera === "starting"} onClick={() => fileRef.current?.click()}>
            {t.selfie.openCamera}
          </PrimaryButton>
        )}
        {onBack && !photo && (
          <SecondaryButton disabled={busy} onClick={onBack}>
            {t.common.back}
          </SecondaryButton>
        )}
      </div>
    </div>
  );
}
