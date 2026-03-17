import type {
  BinaryAttachment,
  BinaryPreviewKind,
  Item,
  NodeActivationId,
  NodeId,
  RunId,
  WorkflowId,
} from "../../types";

class AttachmentIdFactory {
  static create(fallbackValue: string): string {
    const cryptoObject = globalThis.crypto;
    if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
      return cryptoObject.randomUUID();
    }
    return fallbackValue;
  }
}
import type {
  BinaryAttachmentCreateRequest,
  BinaryStorage,
  BinaryStorageReadResult,
  NodeBinaryAttachmentService,
  ExecutionBinaryService,
} from "../../types";

export class UnavailableBinaryStorage implements BinaryStorage {
  readonly driverName = "unavailable";

  async write(): Promise<never> {
    throw new Error("Binary storage is not configured for this runtime.");
  }

  async openReadStream(): Promise<undefined> {
    return undefined;
  }

  async stat(): Promise<{ exists: false }> {
    return { exists: false };
  }

  async delete(): Promise<void> {}
}

export class DefaultExecutionBinaryService implements ExecutionBinaryService {
  constructor(
    private readonly storage: BinaryStorage,
    private readonly workflowId: WorkflowId,
    private readonly runId: RunId,
    private readonly now: () => Date,
  ) {}

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
}

class DefaultNodeBinaryAttachmentService implements NodeBinaryAttachmentService {
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
