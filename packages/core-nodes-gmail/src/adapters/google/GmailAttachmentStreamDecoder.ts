import type { Readable } from "node:stream";
import make from "stream-json";

/**
 * Decodes a Gmail attachment response stream into an AsyncIterable of binary chunks.
 *
 * Gmail's `attachments.get` API (with `responseType: "stream"`) returns a Node Readable
 * yielding the raw JSON envelope: `{"size": N, "data": "<base64url-string>"}`.
 *
 * This decoder:
 * 1. Uses stream-json to parse the JSON token stream without buffering the full string.
 * 2. Extracts `stringChunk` tokens from the `data` field only.
 * 3. Passes base64url chunks through a carry-buffer decoder that handles misaligned
 *    4-character boundaries across chunk boundaries.
 *
 * Peak memory is bounded to the chunk size rather than the full attachment size.
 */
export class GmailAttachmentStreamDecoder {
  decodeResponseStream(responseReadable: Readable): AsyncIterable<Uint8Array> {
    return this.generateDecodedChunks(responseReadable);
  }

  private async *generateDecodedChunks(responseReadable: Readable): AsyncIterable<Uint8Array> {
    const base64Chunks = this.extractDataFieldChunks(responseReadable);
    yield* this.decodeBase64UrlChunks(base64Chunks);
  }

  private extractDataFieldChunks(responseReadable: Readable): AsyncIterable<string> {
    return {
      [Symbol.asyncIterator]: () => this.makeDataFieldIterator(responseReadable),
    };
  }

  private makeDataFieldIterator(responseReadable: Readable): AsyncIterator<string> {
    // packStrings: false => emits startString / stringChunk / endString tokens
    // packKeys: true => emits keyValue tokens (full key in one shot — keys are short)
    const jsonStream = make({ packStrings: false, packKeys: true });

    const chunks: string[] = [];
    let resolveNext: ((result: IteratorResult<string>) => void) | undefined;
    let rejectNext: ((err: unknown) => void) | undefined;
    let done = false;
    let error: unknown = undefined;

    let insideDataField = false;
    let lastKeyWasData = false;

    jsonStream.on("keyValue", (value: unknown) => {
      lastKeyWasData = value === "data";
    });

    jsonStream.on("startString", () => {
      if (lastKeyWasData) {
        insideDataField = true;
      }
    });

    jsonStream.on("stringChunk", (value: unknown) => {
      if (!insideDataField) {
        return;
      }
      const chunk = String(value);
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = undefined;
        rejectNext = undefined;
        resolve({ value: chunk, done: false });
      } else {
        chunks.push(chunk);
      }
    });

    jsonStream.on("endString", () => {
      if (insideDataField) {
        insideDataField = false;
        lastKeyWasData = false;
      }
    });

    const finish = (): void => {
      done = true;
      if (resolveNext) {
        const resolve = resolveNext;
        resolveNext = undefined;
        rejectNext = undefined;
        resolve({ value: undefined as unknown as string, done: true });
      }
    };

    jsonStream.on("finish", finish);
    jsonStream.on("end", finish);

    jsonStream.on("error", (err: unknown) => {
      error = err;
      if (rejectNext) {
        const reject = rejectNext;
        resolveNext = undefined;
        rejectNext = undefined;
        reject(err);
      }
    });

    responseReadable.pipe(jsonStream);

    return {
      next(): Promise<IteratorResult<string>> {
        if (error) {
          return Promise.reject(error);
        }
        if (chunks.length > 0) {
          return Promise.resolve({ value: chunks.shift()!, done: false });
        }
        if (done) {
          return Promise.resolve({ value: undefined as unknown as string, done: true });
        }
        return new Promise<IteratorResult<string>>((resolve, reject) => {
          resolveNext = resolve;
          rejectNext = reject;
        });
      },
      return(): Promise<IteratorResult<string>> {
        return Promise.resolve({ value: undefined as unknown as string, done: true });
      },
    };
  }

  private async *decodeBase64UrlChunks(chunks: AsyncIterable<string>): AsyncIterable<Uint8Array> {
    // carry holds leftover base64 chars that didn't form a complete 4-char group
    let carry = "";
    for await (const raw of chunks) {
      // Normalise base64url → base64
      const chunk = carry + raw.replace(/-/g, "+").replace(/_/g, "/");
      // Decode in multiples of 4 chars; keep the tail as carry
      const alignedLength = Math.floor(chunk.length / 4) * 4;
      if (alignedLength > 0) {
        // eslint-disable-next-line codemation/no-buffer-everything -- bounded base64 chunk from streaming JSON parser; stream-json emits stringChunk tokens of a few KB each, never the full attachment
        yield Buffer.from(chunk.slice(0, alignedLength), "base64") as unknown as Uint8Array;
      }
      carry = chunk.slice(alignedLength);
    }
    // Flush any remaining carry (padding is implicit for Buffer.from)
    if (carry.length > 0) {
      // eslint-disable-next-line codemation/no-buffer-everything -- bounded carry flush ≤3 chars from the base64 quartet alignment; the full attachment is never materialised
      yield Buffer.from(carry, "base64") as unknown as Uint8Array;
    }
  }
}
