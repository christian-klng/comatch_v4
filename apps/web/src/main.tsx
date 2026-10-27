import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "./index.css";
import { AdminPage } from "./pages/AdminPage.tsx";
import { DevStatusPage } from "./pages/DevStatusPage.tsx";
import { JoinPage } from "./pages/JoinPage.tsx";
import { PresentPage } from "./pages/PresentPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DevStatusPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/present/:eventId" element={<PresentPage />} />
        <Route path="/e/:slug" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
