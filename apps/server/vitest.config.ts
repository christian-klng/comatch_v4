import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // Alle Testdateien teilen sich eine Test-Datenbank.
    fileParallelism: false,
  },
});
