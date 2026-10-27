import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Spinner, cx } from "../../components/ui.tsx";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean };

const buttonBase =
  "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-lg font-semibold transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-40";

export function PrimaryButton({ busy, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      className={cx(
        buttonBase,
        "bg-brand text-white shadow-lg shadow-brand/25 active:scale-[0.98]",
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function SecondaryButton({ className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        buttonBase,
        "bg-white/5 text-slate-200 ring-1 ring-white/10 active:bg-white/10",
        className,
      )}
    />
  );
}

/** Rahmen für alle Handy-Ansichten: volle Höhe, schmale Spalte, Event-Farbe als Markenfarbe. */
export function Screen({
  color,
  logoUrl,
  title,
  children,
}: {
  color?: string | null;
  logoUrl?: string | null;
  title?: string;
  children: ReactNode;
}) {
  const style = color ? ({ "--color-brand": color } as CSSProperties) : undefined;
  return (
    <div style={style} className="min-h-full bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {(logoUrl || title) && (
          <header className="flex items-center gap-3">
            {logoUrl && <img src={logoUrl} alt="" className="h-8 max-w-[40%] object-contain" />}
            {title && <p className="truncate text-sm font-medium text-slate-400">{title}</p>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}

export function Message({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="text-6xl" aria-hidden>
        {icon}
      </span>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <div className="max-w-sm text-slate-400">{children}</div>}
    </div>
  );
}
