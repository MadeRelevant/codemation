import { createHash } from "node:crypto";




import { Transform } from "node:stream";






export class CountingSha256Transform extends Transform {
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
