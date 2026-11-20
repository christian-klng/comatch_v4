import { Route, Routes } from "react-router";
import { AuthProvider, RequireAdmin } from "../../lib/auth.tsx";
import { AccountPage } from "./AccountPage.tsx";
import { AdminLayout } from "./AdminLayout.tsx";
import { EventEditPage } from "./EventEditPage.tsx";
import { EventListPage } from "./EventListPage.tsx";
import { InviteAcceptPage } from "./InviteAcceptPage.tsx";
import { LoginPage } from "./LoginPage.tsx";
import { ForgotPasswordPage, ResetPasswordPage } from "./PasswordResetPages.tsx";
import { SignupPage, VerifyEmailPage } from "./SignupPages.tsx";
import { TeamPage } from "./TeamPage.tsx";

// Eigener Code-Chunk: Handys von Teilnehmenden laden den Admin-Bereich nicht mit.

/** Alles unter /admin/* */
export default function AdminApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="verify/:token" element={<VerifyEmailPage />} />
        <Route path="forgot" element={<ForgotPasswordPage />} />
        <Route path="reset/:token" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<EventListPage />} />
          <Route path="events/:id" element={<EventEditPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

/** /invite/:token */
export function InviteApp() {
  return (
    <AuthProvider>
      <InviteAcceptPage />
    </AuthProvider>
  );
}
