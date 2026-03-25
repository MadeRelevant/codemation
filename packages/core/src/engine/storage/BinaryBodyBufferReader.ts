import { ReadableStream } from "node:stream/web";

import type { BinaryBody } from "../../types";

export class BinaryBodyBufferReader {
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
