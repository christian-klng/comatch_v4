import { beforeAll, describe, expect, it } from "vitest";
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
  beforeAll(async () => {
    await storage.ensureBucket();
    await storage.deletePrefix("");
  });

  it("speichert, liest und löscht Objekte", async () => {
    await storage.put("a/b/bild.jpg", Buffer.from("hallo"), "image/jpeg");
    const object = await storage.get("a/b/bild.jpg");
    expect(object?.contentType).toBe("image/jpeg");
    expect(object?.data.toString()).toBe("hallo");

    await storage.delete("a/b/bild.jpg");
    expect(await storage.get("a/b/bild.jpg")).toBeNull();
  });

  it("löscht alle Objekte unter einem Präfix", async () => {
    await Promise.all(
      ["events/1/x.jpg", "events/1/sub/y.jpg", "events/12/z.jpg"].map((key) =>
        storage.put(key, Buffer.from(key), "image/jpeg"),
      ),
    );
    await storage.deletePrefix("events/1/");
    expect(await storage.get("events/1/x.jpg")).toBeNull();
    expect(await storage.get("events/1/sub/y.jpg")).toBeNull();
    expect(await storage.get("events/12/z.jpg")).not.toBeNull();
  });
});
