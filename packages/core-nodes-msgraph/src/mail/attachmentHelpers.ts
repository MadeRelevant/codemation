/**
 * Helpers for building Graph API fileAttachment objects from binary references.
 *
 * Binary bytes are read via ctx.binary.openReadStream — they NEVER touch item JSON.
 * The resulting base64 string is only used in the transient Graph API request body
 * and is not persisted to workflow state.
 */

import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";
import type { BinaryRef, InlineBinaryRef } from "./outlookMessageSendNode";

/** Shape accepted by the Graph API for file attachments on messages. */
export type GraphFileAttachment = Readonly<{
  "@odata.type": "#microsoft.graph.fileAttachment";
  name: string;
  contentType: string;
  contentBytes: string; // base64
  isInline?: boolean;
  contentId?: string;
}>;

/**
 * Read a BinaryAttachment into a Buffer via the binary service stream.
 * Collects all chunks into a single Uint8Array and wraps in a Buffer.
 */
async function readBinaryToBuffer(binary: NodeBinaryAttachmentService, attachment: BinaryAttachment): Promise<Buffer> {
  const result = await binary.openReadStream(attachment);
  if (!result) {
    throw new Error(
      `attachmentHelpers: could not open read stream for binary "${attachment.filename ?? attachment.id}"`,
    );
  }

  const reader = result.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      totalSize += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Build a Graph `fileAttachment` object from a BinaryAttachment.
 *
 * @param binary      - The node binary service (from ctx.binary).
 * @param attachment  - The binary reference to read.
 * @param name        - Attachment filename to send in the Graph API body.
 * @param isInline    - When true, sets `isInline: true` on the attachment.
 * @param contentId   - CID value for inline attachments (e.g. `"img001@example.com"`).
 */
/**
 * Collect regular and inline binary attachments into Graph API attachment objects.
 * Shared by OutlookMessageSend and OutlookMessageReply.
 */
export async function collectGraphAttachments(
  binary: NodeBinaryAttachmentService,
  itemBinary: Record<string, BinaryAttachment> | undefined,
  regularRefs: ReadonlyArray<BinaryRef> | undefined,
  inlineRefs: ReadonlyArray<InlineBinaryRef> | undefined,
): Promise<ReadonlyArray<unknown>> {
  const result: unknown[] = [];

  for (const ref of regularRefs ?? []) {
    const binaryAttachment = itemBinary?.[ref.slot];
    if (!binaryAttachment) continue;
    result.push(await buildGraphFileAttachment(binary, binaryAttachment, ref.name));
  }

  for (const ref of inlineRefs ?? []) {
    const binaryAttachment = itemBinary?.[ref.slot];
    if (!binaryAttachment) continue;
    result.push(await buildGraphFileAttachment(binary, binaryAttachment, ref.name, true, ref.contentId));
  }

  return result;
}

export async function buildGraphFileAttachment(
  binary: NodeBinaryAttachmentService,
  attachment: BinaryAttachment,
  name: string,
  isInline?: boolean,
  contentId?: string,
): Promise<GraphFileAttachment> {
  const buf = await readBinaryToBuffer(binary, attachment);
  const result: GraphFileAttachment = {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name,
    contentType: attachment.mimeType || "application/octet-stream",
    contentBytes: buf.toString("base64"),
    ...(isInline !== undefined ? { isInline } : {}),
    ...(contentId !== undefined ? { contentId } : {}),
  };
  return result;
}
