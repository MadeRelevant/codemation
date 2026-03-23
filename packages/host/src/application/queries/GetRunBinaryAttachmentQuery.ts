import type { BinaryAttachment } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetRunBinaryAttachmentQuery extends Query<BinaryAttachment | undefined> {
  constructor(
    public readonly runId: string,
    public readonly binaryId: string,
  ) {
    super();
  }
}
