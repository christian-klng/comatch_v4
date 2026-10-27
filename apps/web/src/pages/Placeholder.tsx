import type { ReactNode } from "react";

export function Placeholder({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center text-slate-100">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="max-w-md text-slate-400">{children}</div>
    </main>
  );
}
