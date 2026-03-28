import type { BinaryAttachment, NodeActivationId, NodeId, RunId, WorkflowId } from "../types";

import type {
  BinaryStorage,
  BinaryStorageReadResult,
  ExecutionBinaryService,
  NodeBinaryAttachmentService,
} from "../types";

import { DefaultNodeBinaryAttachmentService } from "./DefaultNodeBinaryAttachmentServiceFactory";

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

export { DefaultNodeBinaryAttachmentService } from "./DefaultNodeBinaryAttachmentServiceFactory";
export { UnavailableBinaryStorage } from "./UnavailableBinaryStorage";
