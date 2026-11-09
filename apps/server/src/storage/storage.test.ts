import { describe } from "vitest";
import { storageContract } from "../../test/storage-contract.ts";
import { createMemoryStorage } from "./storage.ts";

describe("Speicher im Arbeitsspeicher (für Tests)", () => {
  const storage = createMemoryStorage();
  storageContract(storage, () => storage.deletePrefix(""));
});
