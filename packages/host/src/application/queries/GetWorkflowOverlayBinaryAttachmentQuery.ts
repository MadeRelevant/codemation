import type { BinaryAttachment } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetWorkflowOverlayBinaryAttachmentQuery extends Query<BinaryAttachment | undefined> {
  constructor(
    public readonly workflowId: string,
    public readonly binaryId: string,
  ) {
    super();
  }
}
