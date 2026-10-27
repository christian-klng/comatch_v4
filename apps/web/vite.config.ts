import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_TARGET = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Erreichbar im lokalen Netz, damit sich echte Handys zum Testen verbinden können.
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": API_TARGET,
      "/socket.io": { target: API_TARGET, ws: true },
    },
  },
});
