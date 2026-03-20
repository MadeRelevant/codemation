import { createHash } from "node:crypto";




import type { BinaryBody,BinaryStorage,BinaryStorageReadResult,BinaryStorageStatResult,BinaryStorageWriteResult } from "../../types";

import { BinaryBodyBufferReader } from "./BinaryBodyBufferReader";
import { BinaryBodyReadableStreamFactory } from "./BinaryBodyReadableStreamFactory";

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

export { BinaryBodyBufferReader } from "./BinaryBodyBufferReader";
export { BinaryBodyReadableStreamFactory } from "./BinaryBodyReadableStreamFactory";
