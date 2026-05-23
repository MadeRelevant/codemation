import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFilesystemBinaryStorage } from "../../../src/infrastructure/binary/LocalFilesystemBinaryStorageRegistry";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "codemation-binary-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function makeStorage(): LocalFilesystemBinaryStorage {
  return new LocalFilesystemBinaryStorage(tempDir);
}

function makeBody(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  // eslint-disable-next-line codemation/no-buffer-everything -- test-only helper; intentionally reads all chunks to verify round-trip correctness
  return Buffer.concat(chunks);
}

describe("LocalFilesystemBinaryStorage", () => {
  it("write and openReadStream round-trip", async () => {
    const storage = makeStorage();
    const content = "hello, binary!";
    await storage.write({ storageKey: "test/file.txt", body: makeBody(content) });

    const result = await storage.openReadStream("test/file.txt");
    expect(result).toBeDefined();
    const data = await readAll(result!.body as ReadableStream<Uint8Array>);
    expect(data.toString("utf-8")).toBe(content);
    expect(result!.size).toBe(Buffer.byteLength(content));
  });

  it("openReadStream returns undefined for nonexistent key", async () => {
    const storage = makeStorage();
    const result = await storage.openReadStream("missing/file.txt");
    expect(result).toBeUndefined();
  });

  it("stat returns exists:true and size for existing file", async () => {
    const storage = makeStorage();
    await storage.write({ storageKey: "check.txt", body: makeBody("data") });
    const stat = await storage.stat("check.txt");
    expect(stat.exists).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
  });

  it("stat returns exists:false for missing file", async () => {
    const storage = makeStorage();
    const stat = await storage.stat("not-there.txt");
    expect(stat.exists).toBe(false);
  });

  it("delete removes file", async () => {
    const storage = makeStorage();
    await storage.write({ storageKey: "deleteme.txt", body: makeBody("bye") });
    await storage.delete("deleteme.txt");
    const stat = await storage.stat("deleteme.txt");
    expect(stat.exists).toBe(false);
  });

  it("deleteMany removes multiple files", async () => {
    const storage = makeStorage();
    await storage.write({ storageKey: "a.txt", body: makeBody("a") });
    await storage.write({ storageKey: "b.txt", body: makeBody("b") });
    await storage.deleteMany(["a.txt", "b.txt"]);
    expect((await storage.stat("a.txt")).exists).toBe(false);
    expect((await storage.stat("b.txt")).exists).toBe(false);
  });

  it("listByPrefix returns matching keys", async () => {
    const storage = makeStorage();
    await storage.write({ storageKey: "prefix/file1.txt", body: makeBody("1") });
    await storage.write({ storageKey: "prefix/file2.txt", body: makeBody("2") });
    await storage.write({ storageKey: "other/file3.txt", body: makeBody("3") });

    const keys = await storage.listByPrefix("prefix/");
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.includes("file1.txt"))).toBe(true);
    expect(keys.some((k) => k.includes("file2.txt"))).toBe(true);
    expect(keys.some((k) => k.includes("file3.txt"))).toBe(false);
  });

  it("listByPrefix returns empty when prefix does not match anything", async () => {
    const storage = makeStorage();
    await storage.write({ storageKey: "data/file.txt", body: makeBody("x") });
    const keys = await storage.listByPrefix("nomatch/");
    expect(keys).toHaveLength(0);
  });

  it("write returns correct storageKey and size", async () => {
    const storage = makeStorage();
    const content = "test content";
    const result = await storage.write({ storageKey: "result-test.txt", body: makeBody(content) });
    expect(result.storageKey).toBe("result-test.txt");
    expect(result.size).toBe(Buffer.byteLength(content));
    expect(result.sha256).toBeTruthy();
  });

  it("throws when storageKey tries to escape base directory", async () => {
    const storage = makeStorage();
    await expect(storage.write({ storageKey: "../outside/evil.txt", body: makeBody("evil") })).rejects.toThrow(
      "outside base directory",
    );
  });
});
