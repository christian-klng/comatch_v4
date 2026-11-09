import { beforeEach, expect, it } from "vitest";
import type { Storage } from "../src/storage/storage.ts";

/** Gleiche Prüfungen für jede Speicher-Art. `clear` leert den Speicher vor jedem Test. */
export function storageContract(storage: Storage, clear: () => Promise<void>) {
  beforeEach(clear);

  it("speichert, liest, überschreibt und löscht Objekte", async () => {
    await storage.put("a/b/bild.jpg", Buffer.from("hallo"), "image/jpeg");
    const object = await storage.get("a/b/bild.jpg");
    expect(object?.contentType).toBe("image/jpeg");
    expect(object?.data.toString()).toBe("hallo");

    await storage.put("a/b/bild.jpg", Buffer.from("neu"), "image/webp");
    expect(await storage.get("a/b/bild.jpg")).toMatchObject({ contentType: "image/webp" });
    expect((await storage.get("a/b/bild.jpg"))?.data.toString()).toBe("neu");

    await storage.delete("a/b/bild.jpg");
    expect(await storage.get("a/b/bild.jpg")).toBeNull();
    // Löschen eines fehlenden Schlüssels ist kein Fehler.
    await storage.delete("a/b/bild.jpg");
  });

  it("löscht alle Objekte unter einem Präfix", async () => {
    await Promise.all(
      ["events/1/x.jpg", "events/1/sub/y.jpg", "events/12/z.jpg", "events/1_/w.jpg"].map((key) =>
        storage.put(key, Buffer.from(key), "image/jpeg"),
      ),
    );
    await storage.deletePrefix("events/1/");
    expect(await storage.get("events/1/x.jpg")).toBeNull();
    expect(await storage.get("events/1/sub/y.jpg")).toBeNull();
    expect(await storage.get("events/12/z.jpg")).not.toBeNull();
    expect(await storage.get("events/1_/w.jpg")).not.toBeNull();
  });
}
