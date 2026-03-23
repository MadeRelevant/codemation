import type { BinaryAttachment, BinaryBody } from "@codemation/core";
import { Command } from "../bus/Command";

export class UploadOverlayPinnedBinaryCommand extends Command<BinaryAttachment> {
  constructor(
    public readonly workflowId: string,
    public readonly nodeId: string,
    public readonly itemIndex: number,
    public readonly attachmentName: string,
    public readonly mimeType: string,
    public readonly body: BinaryBody,
    public readonly filename?: string,
  ) {
    super();
  }
}
