import { describe } from "vitest";
import { storageContract } from "../../test/storage-contract.ts";
import { createS3Storage } from "./s3.ts";

// Läuft gegen den S3-Emulator aus docker-compose.yml (npm run db:up), in der CI als Service.
const storage = createS3Storage({
  endpoint: process.env.TEST_S3_ENDPOINT ?? "http://localhost:9040",
  region: "fsn1",
  bucket: "comatch-test",
  accessKeyId: "comatch",
  secretAccessKey: "comatch-dev-secret",
});

describe("S3-Speicher", () => {
  storageContract(storage, async () => {
    await storage.ensureBucket();
    await storage.deletePrefix("");
  });
});
