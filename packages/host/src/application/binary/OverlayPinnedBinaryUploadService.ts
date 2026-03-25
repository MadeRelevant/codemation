import type { BinaryAttachment, BinaryBody, BinaryPreviewKind, BinaryStorage } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import sanitizeFilename from "sanitize-filename";

/** Sentinel run id for debugger-overlay pinned-output uploads (not a real execution). */
export const OVERLAY_PIN_BINARY_RUN_ID = "overlay-pin";

@injectable()
export class OverlayPinnedBinaryUploadService {
  constructor(@inject(CoreTokens.BinaryStorage) private readonly binaryStorage: BinaryStorage) {}

  async attach(
    args: Readonly<{
      workflowId: string;
      nodeId: string;
      itemIndex: number;
      name: string;
      body: BinaryBody;
      mimeType: string;
      filename?: string;
      previewKind?: BinaryAttachment["previewKind"];
    }>,
  ): Promise<BinaryAttachment> {
    const attachmentId = this.createAttachmentId();
    const createdAt = new Date().toISOString();
    const activationId = this.overlayActivationId(args.itemIndex);
    const storageKey = this.createStorageKey({
      workflowId: args.workflowId,
      runId: OVERLAY_PIN_BINARY_RUN_ID,
      nodeId: args.nodeId,
      activationId,
      attachmentId,
      name: args.name,
      filename: args.filename,
    });
    const stored = await this.binaryStorage.write({
      storageKey,
      body: args.body,
    });
    return {
      id: attachmentId,
      storageKey: stored.storageKey,
      mimeType: args.mimeType,
      size: stored.size,
      storageDriver: this.binaryStorage.driverName,
      previewKind: args.previewKind ?? this.resolvePreviewKind(args.mimeType),
      createdAt,
      runId: OVERLAY_PIN_BINARY_RUN_ID,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId,
      filename: args.filename,
      sha256: stored.sha256,
    };
  }

  private overlayActivationId(itemIndex: number): string {
    return `overlay-pin-i${itemIndex}`;
  }

  private createAttachmentId(): string {
    const cryptoObject = globalThis.crypto;
    if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
      return cryptoObject.randomUUID();
    }
    return `bin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private createStorageKey(
    args: Readonly<{
      workflowId: string;
      runId: string;
      nodeId: string;
      activationId: string;
      attachmentId: string;
      name: string;
      filename?: string;
    }>,
  ): string {
    const safeName = this.sanitizeSegment(args.name);
    const safeFilename = this.sanitizeFilenameForKey(args.filename);
    const filenameSuffix = safeFilename ? `-${safeFilename}` : "";
    return `${this.sanitizeSegment(args.workflowId)}/${this.sanitizeSegment(args.runId)}/${this.sanitizeSegment(args.nodeId)}/${this.sanitizeSegment(args.activationId)}/${args.attachmentId}-${safeName}${filenameSuffix}`;
  }

  private sanitizeSegment(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return "item";
    }
    const safe = sanitizeFilename(normalized);
    return safe || "item";
  }

  private sanitizeFilenameForKey(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const basename = value.trim().split("/").at(-1)?.split("\\").at(-1) ?? value.trim();
    if (!basename) {
      return undefined;
    }
    const safe = sanitizeFilename(basename);
    return safe || undefined;
  }

  private resolvePreviewKind(mimeType: string): BinaryPreviewKind {
    if (mimeType.startsWith("image/")) {
      return "image";
    }
    if (mimeType.startsWith("audio/")) {
      return "audio";
    }
    if (mimeType.startsWith("video/")) {
      return "video";
    }
    return "download";
  }
}
