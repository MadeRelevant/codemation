import { inject } from "@codemation/core";
import type { BinaryAttachment } from "@codemation/core";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { OverlayPinnedBinaryUploadService } from "../binary/OverlayPinnedBinaryUploadService";
import { CommandHandler } from "../bus/CommandHandler";
import { UploadOverlayPinnedBinaryCommand } from "./UploadOverlayPinnedBinaryCommand";

@HandlesCommand.for(UploadOverlayPinnedBinaryCommand)
export class UploadOverlayPinnedBinaryCommandHandler extends CommandHandler<UploadOverlayPinnedBinaryCommand, BinaryAttachment> {
  constructor(
    @inject(OverlayPinnedBinaryUploadService)
    private readonly overlayPinnedBinaryUpload: OverlayPinnedBinaryUploadService,
  ) {
    super();
  }

  async execute(command: UploadOverlayPinnedBinaryCommand): Promise<BinaryAttachment> {
    return this.overlayPinnedBinaryUpload.attach({
      workflowId: command.workflowId,
      nodeId: command.nodeId,
      itemIndex: command.itemIndex,
      name: command.attachmentName,
      mimeType: command.mimeType,
      body: command.body,
      filename: command.filename,
    });
  }
}
