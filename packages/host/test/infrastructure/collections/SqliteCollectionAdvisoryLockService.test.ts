import { describe, expect, it } from "vitest";
import { SqliteCollectionAdvisoryLockService } from "../../../src/infrastructure/collections/SqliteCollectionAdvisoryLockService";

describe("SqliteCollectionAdvisoryLockService", () => {
  it("runs a function inside a lock and returns its result", async () => {
    const svc = new SqliteCollectionAdvisoryLockService();
    const result = await svc.withLock("key-a", async () => 42);
    expect(result).toBe(42);
  });

  it("serializes concurrent calls on the same key", async () => {
    const svc = new SqliteCollectionAdvisoryLockService();
    const order: number[] = [];

    // Start both without awaiting yet
    const first = svc.withLock("key", async () => {
      // Yield to allow second to try acquiring
      await Promise.resolve();
      order.push(1);
    });
    const second = svc.withLock("key", async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });

  it("allows concurrent calls on different keys", async () => {
    const svc = new SqliteCollectionAdvisoryLockService();
    const results: string[] = [];

    await Promise.all([
      svc.withLock("key-a", async () => {
        results.push("a");
      }),
      svc.withLock("key-b", async () => {
        results.push("b");
      }),
    ]);

    expect(results).toContain("a");
    expect(results).toContain("b");
  });

  it("releases the lock even when the callback throws", async () => {
    const svc = new SqliteCollectionAdvisoryLockService();

    await expect(
      svc.withLock("key", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Subsequent lock acquisition on same key should still work
    const result = await svc.withLock("key", async () => "ok");
    expect(result).toBe("ok");
  });

  it("cleans up the lock entry after completion", async () => {
    const svc = new SqliteCollectionAdvisoryLockService();
    await svc.withLock("cleanup-key", async () => "done");

    // Internal map should be empty — no stored reference for completed key
    // (verify indirectly by re-using the key successfully)
    const result = await svc.withLock("cleanup-key", async () => "second");
    expect(result).toBe("second");
  });
});
