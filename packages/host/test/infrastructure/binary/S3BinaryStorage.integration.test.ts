import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GenericContainer } from "testcontainers";

import { S3BinaryStorage } from "../../../src/infrastructure/binary/S3BinaryStorage";
import type { S3BinaryStorageConfig } from "../../../src/infrastructure/binary/S3BinaryStorageConfig";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";

const MINIO_ROOT_USER = "minioadmin";
const MINIO_ROOT_PASSWORD = "minioadmin";
const BUCKET_NAME = "test-bucket";

let storage: S3BinaryStorage;
let stopContainer: () => Promise<void>;

beforeAll(async () => {
  const container = await new GenericContainer("minio/minio")
    .withCommand(["server", "/data"])
    .withEnvironment({
      MINIO_ROOT_USER,
      MINIO_ROOT_PASSWORD,
    })
    .withExposedPorts(9000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(9000);
  const endpoint = `http://${host}:${port}`;

  stopContainer = async () => {
    await container.stop();
  };

  // Create the bucket via S3Client directly
  const adminClient = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: MINIO_ROOT_USER,
      secretAccessKey: MINIO_ROOT_PASSWORD,
    },
  });
  await adminClient.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));

  const config: S3BinaryStorageConfig = {
    endpoint,
    region: "us-east-1",
    bucket: BUCKET_NAME,
    accessKeyId: MINIO_ROOT_USER,
    secretAccessKey: MINIO_ROOT_PASSWORD,
  };

  storage = new S3BinaryStorage(config, true);
}, 120_000);

afterAll(async () => {
  await stopContainer?.();
});

describe("S3BinaryStorage (MinIO testcontainer)", () => {
  it("put → get → exists=true → delete → exists=false (round-trip)", async () => {
    const key = "ws-1/run-1/bin-round-trip";
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const writeResult = await storage.write({ storageKey: key, body: data });
    expect(writeResult.storageKey).toBe(key);
    expect(writeResult.size).toBe(5);

    const statResult = await storage.stat(key);
    expect(statResult.exists).toBe(true);

    const readResult = await storage.openReadStream(key);
    expect(readResult).toBeDefined();
    const chunks: Uint8Array[] = [];
    if (readResult) {
      const reader = readResult.body.getReader();
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        if (chunk.value) {
          chunks.push(chunk.value);
        }
      }
    }
    // eslint-disable-next-line codemation/no-buffer-everything -- test-only assertion; reads all chunks intentionally to verify round-trip correctness
    const combined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    expect(combined).toEqual(Buffer.from(data));

    await storage.delete(key);

    const statAfterDelete = await storage.stat(key);
    expect(statAfterDelete.exists).toBe(false);
  });

  it("stat returns exists=false for nonexistent key", async () => {
    const result = await storage.stat("ws-1/run-1/does-not-exist");
    expect(result.exists).toBe(false);
  });

  it("openReadStream returns undefined for nonexistent key", async () => {
    const result = await storage.openReadStream("ws-1/run-1/does-not-exist");
    expect(result).toBeUndefined();
  });

  it("deleteMany removes all specified keys", async () => {
    const keys = ["ws-del/run-1/bin-a", "ws-del/run-1/bin-b", "ws-del/run-1/bin-c"];
    for (const key of keys) {
      await storage.write({ storageKey: key, body: new Uint8Array([0]) });
    }
    for (const key of keys) {
      expect((await storage.stat(key)).exists).toBe(true);
    }

    await storage.deleteMany(keys);

    for (const key of keys) {
      expect((await storage.stat(key)).exists).toBe(false);
    }
  });

  it("deleteMany handles batches above 1000 keys", async () => {
    const count = 1050;
    const keys: string[] = [];
    // Write in parallel batches to avoid overwhelming the container
    for (let i = 0; i < count; i += 50) {
      const batch = Array.from({ length: Math.min(50, count - i) }, (_, j) => `ws-batch/run-1/bin-${i + j}`);
      await Promise.all(batch.map((key) => storage.write({ storageKey: key, body: new Uint8Array([0]) })));
      keys.push(...batch);
    }

    await storage.deleteMany(keys);

    // Spot-check a few
    expect((await storage.stat("ws-batch/run-1/bin-0")).exists).toBe(false);
    expect((await storage.stat("ws-batch/run-1/bin-1000")).exists).toBe(false);
    expect((await storage.stat("ws-batch/run-1/bin-1049")).exists).toBe(false);
  }, 120_000);

  it("listByPrefix returns all keys under a prefix", async () => {
    const prefix = "ws-list/run-prefix/";
    const keys = [`${prefix}a`, `${prefix}b`, `${prefix}c`];
    for (const key of keys) {
      await storage.write({ storageKey: key, body: new Uint8Array([0]) });
    }

    const listed = await storage.listByPrefix(prefix);
    expect([...listed].sort()).toEqual([...keys].sort());

    await storage.deleteMany(keys);
  });

  it("listByPrefix paginates past 1000 keys", async () => {
    const prefix = "ws-page/run-1/";
    const count = 1050;
    // Write in batches
    for (let i = 0; i < count; i += 50) {
      const batch = Array.from({ length: Math.min(50, count - i) }, (_, j) => `${prefix}bin-${i + j}`);
      await Promise.all(batch.map((key) => storage.write({ storageKey: key, body: new Uint8Array([0]) })));
    }

    const listed = await storage.listByPrefix(prefix);
    expect(listed.length).toBe(count);

    await storage.deleteMany(listed);
  }, 120_000);

  it("streams a 10MB payload without loading fully into memory", async () => {
    const key = "ws-stream/run-1/bin-10mb";
    const size = 10 * 1024 * 1024; // 10MB
    const data = Buffer.alloc(size, 0x42);

    await storage.write({ storageKey: key, body: data });

    const readResult = await storage.openReadStream(key);
    expect(readResult).toBeDefined();

    let bytesRead = 0;
    let maxChunkSize = 0;
    const reader = readResult!.body.getReader();
    let done = false;
    while (!done) {
      const chunk = await reader.read();
      done = chunk.done;
      if (chunk.value) {
        bytesRead += chunk.value.byteLength;
        maxChunkSize = Math.max(maxChunkSize, chunk.value.byteLength);
      }
    }

    expect(bytesRead).toBe(size);
    // Confirm it streamed in chunks (not loaded all at once — max chunk < full size)
    expect(maxChunkSize).toBeLessThan(size);

    await storage.delete(key);
  }, 60_000);

  it("checkConnectivity succeeds for a reachable bucket", async () => {
    await expect(storage.checkConnectivity()).resolves.not.toThrow();
  });
});
