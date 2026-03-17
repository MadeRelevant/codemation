import { createHash } from "node:crypto";
import { ReadableStream } from "node:stream/web";
import type { BinaryBody, BinaryStorage, BinaryStorageReadResult, BinaryStorageStatResult, BinaryStorageWriteResult } from "../../types";

export class InMemoryBinaryStorage implements BinaryStorage {
  readonly driverName = "memory";
  private readonly values = new Map<string, Uint8Array>();

  async write(args: { storageKey: string; body: BinaryBody }): Promise<BinaryStorageWriteResult> {
    const bytes = await new BinaryBodyBufferReader().read(args.body);
    this.values.set(args.storageKey, bytes);
    return {
      storageKey: args.storageKey,
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  async openReadStream(storageKey: string): Promise<BinaryStorageReadResult | undefined> {
    const bytes = this.values.get(storageKey);
    if (!bytes) {
      return undefined;
    }
    return {
      body: new BinaryBodyReadableStreamFactory(bytes).create(),
      size: bytes.byteLength,
    };
  }

  async stat(storageKey: string): Promise<BinaryStorageStatResult> {
    const bytes = this.values.get(storageKey);
    if (!bytes) {
      return { exists: false };
    }
    return { exists: true, size: bytes.byteLength };
  }

  async delete(storageKey: string): Promise<void> {
    this.values.delete(storageKey);
  }
}

class BinaryBodyBufferReader {
  async read(body: BinaryBody): Promise<Uint8Array> {
    if (body instanceof Uint8Array) {
      return body;
    }
    if (body instanceof ArrayBuffer) {
      return new Uint8Array(body);
    }
    if (body instanceof ReadableStream) {
      return await this.readReadableStream(body);
    }
    return await this.readAsyncIterable(body);
  }

  private async readReadableStream(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        chunks.push(result.value);
        totalSize += result.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    return this.joinChunks(chunks, totalSize);
  }

  private async readAsyncIterable(body: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    for await (const chunk of body) {
      chunks.push(chunk);
      totalSize += chunk.byteLength;
    }
    return this.joinChunks(chunks, totalSize);
  }

  private joinChunks(chunks: ReadonlyArray<Uint8Array>, totalSize: number): Uint8Array {
    const bytes = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

class BinaryBodyReadableStreamFactory {
  constructor(private readonly bytes: Uint8Array) {}

  create(): ReadableStream<Uint8Array> {
    const value = this.bytes;
    let consumed = false;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (consumed) {
          controller.close();
          return;
        }
        consumed = true;
        controller.enqueue(value);
        controller.close();
      },
    });
  }
}
