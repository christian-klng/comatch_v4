import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { AdminMe } from "@comatch/shared";
import { api } from "./api.ts";

interface AuthState {
  /** undefined: wird geladen, null: nicht angemeldet */
  admin: AdminMe | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAdmin: (admin: AdminMe | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminMe | null | undefined>(undefined);

  useEffect(() => {
    // Jeder Fehler (401, Netzwerk) führt zur Login-Seite.
    api<AdminMe>("/auth/me")
      .then(setAdmin)
      .catch(() => setAdmin(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setAdmin(await api<AdminMe>("/auth/login", { method: "POST", body: { email, password } }));
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setAdmin(null);
  }, []);

  return <AuthContext value={{ admin, login, logout, setAdmin }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth außerhalb von AuthProvider");
  return ctx;
}

/** Zeigt den Inhalt nur angemeldeten Admins, sonst Weiterleitung zum Login. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { admin } = useAuth();
  const location = useLocation();
  if (admin === undefined) return null;
  if (admin === null) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }
  return children;
}
