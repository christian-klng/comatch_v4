import { NavLink, Outlet } from "react-router";
import { Button, cx } from "../../components/ui.tsx";
import { useAuth } from "../../lib/auth.tsx";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("text-xl font-semibold tracking-tight", className)}>
      Co<span className="text-brand">Match</span>
    </span>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    "rounded-lg px-3 py-1.5 text-sm font-medium",
    isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900",
  );

export function AdminLayout() {
  const { admin, logout } = useAuth();
  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Logo />
          <nav className="flex gap-1">
            <NavLink to="/admin" end className={navClass}>
              Events
            </NavLink>
            <NavLink to="/admin/team" className={navClass}>
              Team
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{admin?.email}</span>
            <Button variant="ghost" onClick={() => void logout()}>
              Abmelden
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
