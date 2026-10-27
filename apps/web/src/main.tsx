import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { DevStatusPage } from "./pages/DevStatusPage.tsx";
import { JoinPage } from "./pages/join/JoinPage.tsx";
import { PresentPage } from "./pages/PresentPage.tsx";

const AdminApp = lazy(() => import("./pages/admin/AdminApp.tsx"));
const InviteApp = lazy(() => import("./pages/admin/AdminApp.tsx").then((m) => ({ default: m.InviteApp })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense>
        <Routes>
          <Route path="/" element={<DevStatusPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/invite/:token" element={<InviteApp />} />
          <Route path="/present/:eventId" element={<PresentPage />} />
          <Route path="/e/:slug" element={<JoinPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
