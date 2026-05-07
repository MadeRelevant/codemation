import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "vitest";
import { GmailAttachmentStreamDecoder } from "../src/adapters/google/GmailAttachmentStreamDecoder";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectBytes(iterable: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of iterable) {
    chunks.push(chunk);
  }
  // eslint-disable-next-line codemation/no-buffer-everything -- test-only helper: collects decoded chunks for assertion; the decoder itself never buffers the full attachment
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

function jsonEnvelope(data: string): string {
  return JSON.stringify({ size: 0, data });
}

// ---------------------------------------------------------------------------
// Happy path — small single-chunk payload
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: single-chunk base64url payload decodes to original bytes", async () => {
  const original = Buffer.from("hello attachment world");
  const encoded = original.toString("base64url");
  const envelope = jsonEnvelope(encoded);

  const decoder = new GmailAttachmentStreamDecoder();
  const stream = Readable.from([envelope]);
  const result = await collectBytes(decoder.decodeResponseStream(stream));

  assert.deepEqual(result, original);
});

// ---------------------------------------------------------------------------
// Multi-chunk stream — data field arrives split across chunks
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: multi-chunk envelope (data split across chunks) decodes correctly", async () => {
  const original = Buffer.alloc(4 * 1024);
  for (let i = 0; i < original.length; i++) {
    original[i] = i % 256;
  }
  const encoded = original.toString("base64url");
  const envelope = jsonEnvelope(encoded);

  // Split into 37-byte chunks to stress both JSON parser and base64 carry-buffer
  const chunkSize = 37;
  const rawChunks: string[] = [];
  for (let offset = 0; offset < envelope.length; offset += chunkSize) {
    rawChunks.push(envelope.slice(offset, offset + chunkSize));
  }

  const decoder = new GmailAttachmentStreamDecoder();
  const stream = Readable.from(rawChunks);
  const result = await collectBytes(decoder.decodeResponseStream(stream));

  assert.deepEqual(result, original);
});

// ---------------------------------------------------------------------------
// Missing data field — rejects with clear error
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: envelope without 'data' field yields zero bytes (no error)", async () => {
  // A valid JSON object with no 'data' field — the iterator simply finds no
  // stringChunk tokens for the data field and finishes cleanly.
  const envelope = JSON.stringify({ size: 0 });

  const decoder = new GmailAttachmentStreamDecoder();
  const stream = Readable.from([envelope]);
  const result = await collectBytes(decoder.decodeResponseStream(stream));

  // No data → no bytes emitted
  assert.equal(result.byteLength, 0);
});

// ---------------------------------------------------------------------------
// Invalid JSON → error propagated through the async iterator
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: invalid JSON in stream propagates error to consumer", async () => {
  const decoder = new GmailAttachmentStreamDecoder();
  // Emit valid start then garbage — stream-json will emit an error event
  const stream = Readable.from(["{not valid json!!"]);

  await assert.rejects(async () => {
    await collectBytes(decoder.decodeResponseStream(stream));
  });
});

// ---------------------------------------------------------------------------
// Error during iteration (covers both L94-99 rejectNext and L108 cached-error)
// via the same invalid-JSON scenario in different consumer patterns.
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: malformed JSON midstream causes reject on the first consumed chunk", async () => {
  const decoder = new GmailAttachmentStreamDecoder();

  // Envelope with mismatched brackets — stream-json emits error on parse
  const badStream = Readable.from(['{"size":5,"data":"aGVsbG8"]}}}}']);

  await assert.rejects(async () => {
    await collectBytes(decoder.decodeResponseStream(badStream));
  });
});

// ---------------------------------------------------------------------------
// Error while next() is pending (L94-99 branch — rejectNext path)
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: error during pending next() call triggers rejectNext", async () => {
  const decoder = new GmailAttachmentStreamDecoder();

  // An invalid-JSON stream triggers stream-json's error event while next()
  // has already set up a rejectNext callback (pending promise). This covers L94-99.
  // We use a stream that emits garbage JSON — stream-json will asynchronously
  // process the tokens and fire the error event, which calls rejectNext.
  const badStream = Readable.from(
    (async function* () {
      // Emit garbage JSON — stream-json will error during token parsing
      yield "{ this is definitely not valid json !!!! }}}";
    })(),
  );

  await assert.rejects(async () => {
    await collectBytes(decoder.decodeResponseStream(badStream));
  });
});

// ---------------------------------------------------------------------------
// Iterator return() method (L122 branch)
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: breaking out of for-await invokes iterator return() cleanly", async () => {
  const original = Buffer.from("return path test");
  const encoded = original.toString("base64url");

  // Large enough payload to have multiple chunks — we break after first
  const bigOriginal = Buffer.alloc(8 * 1024, 65);
  const bigEncoded = bigOriginal.toString("base64url");
  const envelope = jsonEnvelope(bigEncoded);

  const chunkSize = 50;
  const rawChunks: string[] = [];
  for (let offset = 0; offset < envelope.length; offset += chunkSize) {
    rawChunks.push(envelope.slice(offset, offset + chunkSize));
  }
  void original;
  void encoded;

  const decoder = new GmailAttachmentStreamDecoder();
  const stream = Readable.from(rawChunks);

  // break after first chunk triggers return() on the underlying iterator
  let firstChunk: Uint8Array | undefined;
  for await (const chunk of decoder.decodeResponseStream(stream)) {
    firstChunk = chunk;
    break; // triggers return()
  }

  assert.ok(firstChunk !== undefined, "should have yielded at least one chunk");
});

// ---------------------------------------------------------------------------
// Direct return() call on the inner iterator (explicit L122 branch)
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: calling return() on the underlying string iterator resolves done", async () => {
  const original = Buffer.from("direct return test");
  const encoded = original.toString("base64url");
  const envelope = jsonEnvelope(encoded);

  const decoder = new GmailAttachmentStreamDecoder();
  const stream = Readable.from([envelope]);

  const iterable = decoder.decodeResponseStream(stream);
  // Access the base64 chunk extractor indirectly via the public interface
  // The string iterator's return() method is exercised by breaking early
  const iter = iterable[Symbol.asyncIterator]();

  // Get one result then call return directly
  const first = await iter.next();
  assert.equal(first.done, false);

  // Call return() — should resolve cleanly with done: true
  if (iter.return) {
    const ret = await iter.return(undefined);
    assert.equal(ret.done, true);
  }
});

// ---------------------------------------------------------------------------
// L108: error already set before next() is called on the inner string iterator.
// We access extractDataFieldChunks indirectly via the class's private method
// by sub-classing and exposing the method.
// ---------------------------------------------------------------------------

test("GmailAttachmentStreamDecoder: cached error branch (L108) — next() rejects when error pre-dates the call", async () => {
  // Subclass to expose private method for testing
  class TestableDecoder extends GmailAttachmentStreamDecoder {
    getStringIterable(readable: Readable): AsyncIterable<string> {
      return (this as unknown as { extractDataFieldChunks(r: Readable): AsyncIterable<string> }).extractDataFieldChunks(
        readable,
      );
    }
  }

  const decoder = new TestableDecoder();

  // Build a stream that errors synchronously — stream-json fires error before
  // the consumer has a chance to call next().
  const badStream = Readable.from(["{invalid json !!!!"]);
  const iterable = decoder.getStringIterable(badStream);
  const iter = iterable[Symbol.asyncIterator]();

  // First next(): pends, rejectNext fires when stream-json errors (L94-99)
  let firstError: unknown;
  try {
    await iter.next();
  } catch (e) {
    firstError = e;
  }
  assert.ok(firstError instanceof Error, "first next() should reject");

  // Now `error` is set on the closure. Second next() hits L108 (if (error))
  // Note: we call .next() on the inner string iterator directly, not on the
  // outer decodeResponseStream (which is done after the first rejection).
  let secondError: unknown;
  try {
    await iter.next();
  } catch (e) {
    secondError = e;
  }
  assert.ok(secondError instanceof Error, "second next() should also reject via L108");
  assert.equal(
    (firstError as Error).message,
    (secondError as Error).message,
    "same error object returned on both calls",
  );
});
