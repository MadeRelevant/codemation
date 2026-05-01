import type { ReadableStream as BinaryReadableStream } from "node:stream/web";

export class BinaryStreamCollector {
  async collect(stream: BinaryReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          break;
        }
        chunks.push(result.value);
        totalLength += result.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    return this.concatenate(chunks, totalLength);
  }

  private concatenate(chunks: ReadonlyArray<Uint8Array>, totalLength: number): Uint8Array {
    const output = Buffer.alloc(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }
}
