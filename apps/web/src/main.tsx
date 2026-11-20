import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { HomePage } from "./pages/HomePage.tsx";
import { JoinPage } from "./pages/join/JoinPage.tsx";

const DevStatusPage = lazy(() =>
  import("./pages/DevStatusPage.tsx").then((m) => ({ default: m.DevStatusPage })),
);
const AdminApp = lazy(() => import("./pages/admin/AdminApp.tsx"));
const PresentPage = lazy(() =>
  import("./pages/present/PresentPage.tsx").then((m) => ({ default: m.PresentPage })),
);
const ImprintPage = lazy(() =>
  import("./pages/legal/LegalPages.tsx").then((m) => ({ default: m.ImprintPage })),
);
const PrivacyPage = lazy(() =>
  import("./pages/legal/LegalPages.tsx").then((m) => ({ default: m.PrivacyPage })),
);
const InviteApp = lazy(() => import("./pages/admin/AdminApp.tsx").then((m) => ({ default: m.InviteApp })));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/status" element={<DevStatusPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/invite/:token" element={<InviteApp />} />
          <Route path="/present/:eventId" element={<PresentPage />} />
          <Route path="/e/:slug" element={<JoinPage />} />
          <Route path="/impressum" element={<ImprintPage />} />
          <Route path="/datenschutz" element={<PrivacyPage />} />
          <Route path="/imprint" element={<ImprintPage language="en" />} />
          <Route path="/privacy" element={<PrivacyPage language="en" />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
