import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { AuthProvider, RequireAdmin } from "./lib/auth.tsx";
import { AdminLayout } from "./pages/admin/AdminLayout.tsx";
import { EventEditPage } from "./pages/admin/EventEditPage.tsx";
import { EventListPage } from "./pages/admin/EventListPage.tsx";
import { InviteAcceptPage } from "./pages/admin/InviteAcceptPage.tsx";
import { LoginPage } from "./pages/admin/LoginPage.tsx";
import { TeamPage } from "./pages/admin/TeamPage.tsx";
import { DevStatusPage } from "./pages/DevStatusPage.tsx";
import { JoinPage } from "./pages/JoinPage.tsx";
import { PresentPage } from "./pages/PresentPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<DevStatusPage />} />
          <Route path="/admin/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<EventListPage />} />
            <Route path="events/:id" element={<EventEditPage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>
          <Route path="/invite/:token" element={<InviteAcceptPage />} />
          <Route path="/present/:eventId" element={<PresentPage />} />
          <Route path="/e/:slug" element={<JoinPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
