import type {
  BinaryAttachment,
  BinaryPreviewKind,
  Item,
  NodeActivationId,
  NodeId,
  RunId,
  WorkflowId,
} from "../../../types";

import type {
  BinaryAttachmentCreateRequest,
  BinaryStorage,
  BinaryStorageReadResult,
  NodeBinaryAttachmentService,
} from "../../../types";

import { AttachmentIdFactory } from "./AttachmentIdFactory";

export class DefaultNodeBinaryAttachmentService implements NodeBinaryAttachmentService {
  constructor(
    private readonly storage: BinaryStorage,
    private readonly workflowId: WorkflowId,
    private readonly runId: RunId,
    private readonly nodeId: NodeId,
    private readonly activationId: NodeActivationId,
    private readonly now: () => Date,
  ) {}

  async attach(args: BinaryAttachmentCreateRequest): Promise<BinaryAttachment> {
    const attachmentId = this.createAttachmentId();
    const createdAt = this.now().toISOString();
    const storageKey = this.createStorageKey(args, attachmentId);
    const stored = await this.storage.write({
      storageKey,
      body: args.body,
    });
    return {
      id: attachmentId,
      storageKey: stored.storageKey,
      mimeType: args.mimeType,
      size: stored.size,
      storageDriver: this.storage.driverName,
      previewKind: args.previewKind ?? this.resolvePreviewKind(args.mimeType),
      createdAt,
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId: this.nodeId,
      activationId: this.activationId,
      filename: args.filename,
      sha256: stored.sha256,
    };
  }

  withAttachment<TJson>(item: Item<TJson>, name: string, attachment: BinaryAttachment): Item<TJson> {
    return {
      ...item,
      binary: {
        ...(item.binary ?? {}),
        [name]: attachment,
      },
    };
  }

  forNode(args: { nodeId: NodeId; activationId: NodeActivationId }): NodeBinaryAttachmentService {
    return new DefaultNodeBinaryAttachmentService(
      this.storage,
      this.workflowId,
      this.runId,
      args.nodeId,
      args.activationId,
      this.now,
    );
  }

  async openReadStream(attachment: BinaryAttachment): Promise<BinaryStorageReadResult | undefined> {
    return await this.storage.openReadStream(attachment.storageKey);
  }

  private createAttachmentId(): string {
    return AttachmentIdFactory.create(`${this.activationId}-${this.now().getTime()}`);
  }

  private createStorageKey(args: BinaryAttachmentCreateRequest, attachmentId: string): string {
    const safeName = this.sanitizeSegment(args.name);
    const safeFilename = this.sanitizeFilename(args.filename);
    const filenameSuffix = safeFilename ? `-${safeFilename}` : "";
    return `${this.sanitizeSegment(this.workflowId)}/${this.sanitizeSegment(this.runId)}/${this.sanitizeSegment(this.nodeId)}/${this.sanitizeSegment(this.activationId)}/${attachmentId}-${safeName}${filenameSuffix}`;
  }

  private sanitizeSegment(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return "item";
    }
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_");
  }

  private sanitizeFilename(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const normalized = value.trim().split("/").at(-1)?.split("\\").at(-1) ?? value.trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.replace(/[^a-zA-Z0-9._-]+/g, "_");
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
