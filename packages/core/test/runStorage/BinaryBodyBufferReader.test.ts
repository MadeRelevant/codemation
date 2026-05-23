import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";
import { ReadableStream } from "node:stream/web";

import { BinaryBodyBufferReader } from "../../src/runStorage/BinaryBodyBufferReader";
import { BinaryBodyReadableStreamFactory } from "../../src/runStorage/BinaryBodyReadableStreamFactory";

describe("BinaryBodyBufferReader", () => {
  const reader = new BinaryBodyBufferReader();

  test("reads Uint8Array directly", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await reader.read(data);
    assert.deepEqual(result, data);
  });

  test("reads ArrayBuffer and returns Uint8Array view", async () => {
    const buf = new Uint8Array([10, 20, 30]).buffer;
    const result = await reader.read(buf as ArrayBuffer);
    assert.deepEqual(result, new Uint8Array([10, 20, 30]));
  });

  test("reads ReadableStream with a single chunk", async () => {
    const chunk = new Uint8Array([4, 5, 6]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const result = await reader.read(stream);
    assert.deepEqual(result, chunk);
  });

  test("reads ReadableStream with multiple chunks and joins them", async () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(a);
        controller.enqueue(b);
        controller.close();
      },
    });
    const result = await reader.read(stream);
    assert.deepEqual(result, new Uint8Array([1, 2, 3, 4, 5]));
  });

  test("reads ReadableStream with empty stream", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const result = await reader.read(stream);
    assert.deepEqual(result, new Uint8Array(0));
  });

  test("reads AsyncIterable with multiple chunks", async () => {
    const chunks = [new Uint8Array([7, 8]), new Uint8Array([9])];
    async function* gen() {
      for (const c of chunks) yield c;
    }
    const result = await reader.read(gen());
    assert.deepEqual(result, new Uint8Array([7, 8, 9]));
  });

  test("reads AsyncIterable with no chunks (empty)", async () => {
    async function* gen() {
      // yields nothing
    }
    const result = await reader.read(gen());
    assert.deepEqual(result, new Uint8Array(0));
  });
});

describe("BinaryBodyReadableStreamFactory", () => {
  test("create returns a readable stream that yields the original bytes", async () => {
    const bytes = new Uint8Array([10, 20, 30]);
    const factory = new BinaryBodyReadableStreamFactory(bytes);
    const stream = factory.create();
    const result = await new BinaryBodyBufferReader().read(stream);
    assert.deepEqual(result, bytes);
  });

  test("creates independent streams from same factory (consumed flag resets per stream)", async () => {
    const bytes = new Uint8Array([1, 2]);
    const factory = new BinaryBodyReadableStreamFactory(bytes);
    // Each call to create() returns a new stream
    const s1 = factory.create();
    const s2 = factory.create();
    const r1 = await new BinaryBodyBufferReader().read(s1);
    const r2 = await new BinaryBodyBufferReader().read(s2);
    assert.deepEqual(r1, bytes);
    assert.deepEqual(r2, bytes);
  });
});
