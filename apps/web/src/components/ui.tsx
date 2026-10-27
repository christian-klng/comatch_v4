import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand/90 shadow-sm",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50",
};

export function Button({
  variant = "primary",
  busy,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

const fieldBase =
  "block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 " +
  "placeholder:text-slate-400 focus:ring-2 focus:ring-brand focus:outline-none " +
  "disabled:bg-slate-50 disabled:text-slate-500";

export function Input({
  invalid,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx(fieldBase, invalid ? "ring-rose-400" : "ring-slate-300", className)}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldBase, "ring-slate-300 pr-8", className)} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : (
        hint && <p className="text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Card({
  children,
  className,
  flush,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div className={cx("rounded-xl bg-white shadow-sm ring-1 ring-slate-200", !flush && "p-6", className)}>
      {children}
    </div>
  );
}

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "warning";
  children: ReactNode;
}) {
  const tones = {
    error: "bg-rose-50 text-rose-700 ring-rose-200",
    info: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    warning: "bg-amber-50 text-amber-800 ring-amber-200",
  };
  return <div className={cx("rounded-lg px-4 py-3 text-sm ring-1", tones[tone])}>{children}</div>;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  draft: { label: "Entwurf", className: "bg-slate-100 text-slate-700" },
  open: { label: "Offen", className: "bg-sky-100 text-sky-800" },
  running: { label: "Läuft", className: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Pausiert", className: "bg-amber-100 text-amber-800" },
  ended: { label: "Beendet", className: "bg-slate-200 text-slate-600" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = statusLabels[status] ?? { label: status, className: "bg-slate-100 text-slate-700" };
  return <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium", s.className)}>{s.label}</span>;
}

/** Kleine Statusmeldung neben Speichern-Buttons. */
export function SaveState({ dirty, saved }: { dirty: boolean; saved: boolean }) {
  if (dirty) return <span className="text-sm text-amber-700">Ungespeicherte Änderungen</span>;
  if (saved) return <span className="text-sm text-emerald-700">Gespeichert ✓</span>;
  return null;
}

export { cx };
