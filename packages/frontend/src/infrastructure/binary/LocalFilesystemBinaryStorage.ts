import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { ReadableStream } from "node:stream/web";
import { pipeline } from "node:stream/promises";
import type { BinaryBody, BinaryStorage, BinaryStorageReadResult, BinaryStorageStatResult, BinaryStorageWriteResult } from "@codemation/core";

export class LocalFilesystemBinaryStorage implements BinaryStorage {
  readonly driverName = "filesystem";

  constructor(private readonly baseDirectory: string) {}

  async write(args: { storageKey: string; body: BinaryBody }): Promise<BinaryStorageWriteResult> {
    const targetPath = this.resolveAbsolutePath(args.storageKey);
    await mkdir(path.dirname(targetPath), { recursive: true });
    const readable = new BinaryBodyNodeReadableFactory(args.body).create();
    const countingTransform = new CountingSha256Transform();
    const writable = createWriteStream(targetPath);
    await pipeline(readable, countingTransform, writable);
    return {
      storageKey: args.storageKey,
      size: countingTransform.size,
      sha256: countingTransform.sha256,
    };
  }

  async openReadStream(storageKey: string): Promise<BinaryStorageReadResult | undefined> {
    const targetPath = this.resolveAbsolutePath(storageKey);
    try {
      const fileStat = await stat(targetPath);
      return {
        body: Readable.toWeb(createReadStream(targetPath)) as ReadableStream<Uint8Array>,
        size: fileStat.size,
      };
    } catch {
      return undefined;
    }
  }

  async stat(storageKey: string): Promise<BinaryStorageStatResult> {
    const targetPath = this.resolveAbsolutePath(storageKey);
    try {
      const fileStat = await stat(targetPath);
      return {
        exists: true,
        size: fileStat.size,
      };
    } catch {
      return {
        exists: false,
      };
    }
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolveAbsolutePath(storageKey), { force: true });
  }

  private resolveAbsolutePath(storageKey: string): string {
    const absoluteBaseDirectory = path.resolve(this.baseDirectory);
    const targetPath = path.resolve(absoluteBaseDirectory, storageKey);
    if (!targetPath.startsWith(`${absoluteBaseDirectory}${path.sep}`) && targetPath !== absoluteBaseDirectory) {
      throw new Error(`Refused to access binary storage path outside base directory: ${storageKey}`);
    }
    return targetPath;
  }
}

class BinaryBodyNodeReadableFactory {
  constructor(private readonly body: BinaryBody) {}

  create(): Readable {
    if (this.body instanceof Uint8Array) {
      return Readable.from([this.body]);
    }
    if (this.body instanceof ArrayBuffer) {
      return Readable.from([new Uint8Array(this.body)]);
    }
    if (this.body instanceof ReadableStream) {
      return Readable.fromWeb(this.body);
    }
    return Readable.from(this.body);
  }
}

class CountingSha256Transform extends Transform {
  private readonly hash = createHash("sha256");
  private byteCount = 0;

  get size(): number {
    return this.byteCount;
  }

  get sha256(): string {
    return this.hash.digest("hex");
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.byteCount += chunk.byteLength;
    this.hash.update(chunk);
    callback(null, chunk);
  }
}
