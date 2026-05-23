import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { InMemoryBinaryStorage } from "../../src/runStorage/InMemoryBinaryStorageRegistry";

describe("InMemoryBinaryStorage", () => {
  test("write and read back bytes", async () => {
    const storage = new InMemoryBinaryStorage();
    const data = new Uint8Array([1, 2, 3, 4]);
    await storage.write({ storageKey: "test-key", body: data });
    const result = await storage.openReadStream("test-key");
    assert.ok(result !== undefined);
    assert.equal(result.size, 4);
  });

  test("openReadStream returns undefined for missing key", async () => {
    const storage = new InMemoryBinaryStorage();
    const result = await storage.openReadStream("nonexistent");
    assert.equal(result, undefined);
  });

  test("stat returns exists:false for missing key", async () => {
    const storage = new InMemoryBinaryStorage();
    const result = await storage.stat("missing-key");
    assert.deepEqual(result, { exists: false });
  });

  test("stat returns exists:true with size for existing key", async () => {
    const storage = new InMemoryBinaryStorage();
    const data = new Uint8Array([10, 20]);
    await storage.write({ storageKey: "stat-key", body: data });
    const result = await storage.stat("stat-key");
    assert.deepEqual(result, { exists: true, size: 2 });
  });

  test("delete removes a key", async () => {
    const storage = new InMemoryBinaryStorage();
    await storage.write({ storageKey: "del-key", body: new Uint8Array([99]) });
    await storage.delete("del-key");
    assert.equal(await storage.openReadStream("del-key"), undefined);
  });

  test("deleteMany removes multiple keys", async () => {
    const storage = new InMemoryBinaryStorage();
    await storage.write({ storageKey: "k1", body: new Uint8Array([1]) });
    await storage.write({ storageKey: "k2", body: new Uint8Array([2]) });
    await storage.deleteMany(["k1", "k2"]);
    assert.equal(await storage.openReadStream("k1"), undefined);
    assert.equal(await storage.openReadStream("k2"), undefined);
  });

  test("listByPrefix returns only keys matching the prefix", async () => {
    const storage = new InMemoryBinaryStorage();
    await storage.write({ storageKey: "run/a", body: new Uint8Array([1]) });
    await storage.write({ storageKey: "run/b", body: new Uint8Array([2]) });
    await storage.write({ storageKey: "other/c", body: new Uint8Array([3]) });
    const keys = await storage.listByPrefix("run/");
    assert.equal(keys.length, 2);
    assert.ok(keys.includes("run/a"));
    assert.ok(keys.includes("run/b"));
  });
});
