/** Ablage für Selfies. In Produktion S3-kompatibel (Hetzner Object Storage), in Tests im Speicher. */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Liefert null, wenn es den Schlüssel nicht gibt. */
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Löscht alle Objekte, deren Schlüssel mit `prefix` beginnt. */
  deletePrefix(prefix: string): Promise<void>;
}

export function createMemoryStorage(): Storage & { keys(): string[] } {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  return {
    async put(key, data, contentType) {
      objects.set(key, { data, contentType });
    },
    async get(key) {
      return objects.get(key) ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async deletePrefix(prefix) {
      for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key);
    },
    keys: () => [...objects.keys()],
  };
}
