import type { BinaryAttachment,BinaryStorage } from "@codemation/core";
import { CoreTokens,inject,injectable } from "@codemation/core";
import { RunBinaryAttachmentLookupService } from "../../../application/binary/RunBinaryAttachmentLookupService";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class BinaryHttpRouteHandler {
  constructor(
    @inject(RunBinaryAttachmentLookupService)
    private readonly lookupService: RunBinaryAttachmentLookupService,
    @inject(CoreTokens.BinaryStorage)
    private readonly binaryStorage: BinaryStorage,
  ) {}

  async getRunBinaryContent(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const attachment = await this.lookupService.findForRun(params.runId!, params.binaryId!);
      return await this.createBinaryResponse(attachment);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getWorkflowOverlayBinaryContent(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const attachment = await this.lookupService.findForWorkflowOverlay(params.workflowId!, params.binaryId!);
      return await this.createBinaryResponse(attachment);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  private async createBinaryResponse(attachment: BinaryAttachment | undefined): Promise<Response> {
    if (!attachment) {
      return Response.json({ error: "Unknown binary attachment" }, { status: 404 });
    }
    const stored = await this.binaryStorage.openReadStream(attachment.storageKey);
    if (!stored) {
      return Response.json({ error: "Binary attachment content is unavailable" }, { status: 404 });
    }
    const headers = new Headers();
    headers.set("content-type", attachment.mimeType);
    headers.set("content-length", String(stored.size ?? attachment.size));
    headers.set("content-disposition", this.createContentDisposition(attachment));
    return new Response(stored.body as unknown as BodyInit, {
      status: 200,
      headers,
    });
  }

  private createContentDisposition(attachment: BinaryAttachment): string {
    const dispositionType = attachment.previewKind === "download" ? "attachment" : "inline";
    const filename = this.escapeFilename(attachment.filename ?? `${attachment.id}`);
    return `${dispositionType}; filename="${filename}"`;
  }

  private escapeFilename(value: string): string {
    return value.replace(/"/g, "");
  }
}
