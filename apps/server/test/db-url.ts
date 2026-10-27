/** Eigene Datenbank für Tests, damit lokale Daten unangetastet bleiben. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://comatch:comatch@localhost:54340/comatch_test";
