import type { BinaryAttachment, NodeExecutionContext } from "@codemation/core";

/** Default cap on bytes read into memory. Tuned for prebuilt OCR analyzers (single document). */
export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Reads the binary body for an OCR analyzer call.
 *
 * The Azure Content Understanding SDK requires a contiguous `Uint8Array`, so the bytes must
 * land in memory at some point. To bound that:
 *  - The attachment's declared `size` is checked against `maxBytes` *before* any allocation.
 *  - A single buffer of exactly `attachment.size` is pre-allocated (no chunks array, no doubling).
 *  - The stream fills the buffer directly; a length mismatch fails fast.
 */
export async function readBinaryBody(
  ctx: Pick<NodeExecutionContext, "binary">,
  attachment: BinaryAttachment,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<Uint8Array> {
  if (attachment.size > maxBytes) {
    throw new Error(
      `Binary attachment size ${attachment.size} bytes exceeds maxBytes ${maxBytes}. ` +
        `Raise the node's maxBytes setting if this document is expected to be larger.`,
    );
  }
  const stream = await ctx.binary.openReadStream(attachment);
  if (!stream) {
    throw new Error("Binary attachment stream is unavailable.");
  }
  const out = new Uint8Array(attachment.size);
  const reader = stream.body.getReader();
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    if (offset + value.byteLength > out.byteLength) {
      throw new Error(`Binary stream produced more bytes than the attachment's declared size (${attachment.size}).`);
    }
    out.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== out.byteLength) {
    throw new Error(`Binary stream produced ${offset} bytes but attachment declared size ${attachment.size}.`);
  }
  return out;
}
