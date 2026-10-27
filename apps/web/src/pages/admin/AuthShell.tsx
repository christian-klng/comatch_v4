import type { ReactNode } from "react";
import { Card } from "../../components/ui.tsx";
import { Logo } from "./AdminLayout.tsx";

/** Rahmen für Login und Einladung. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12 text-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo className="text-3xl" />
        </div>
        <Card>
          <h1 className="mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </Card>
      </div>
    </div>
  );
}
