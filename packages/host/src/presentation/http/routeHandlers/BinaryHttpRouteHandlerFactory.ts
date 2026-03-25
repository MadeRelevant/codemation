import type { BinaryAttachment, BinaryBody, BinaryStorage } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { CommandBus } from "../../../application/bus/CommandBus";
import type { QueryBus } from "../../../application/bus/QueryBus";
import { UploadOverlayPinnedBinaryCommand } from "../../../application/commands/UploadOverlayPinnedBinaryCommand";
import { GetRunBinaryAttachmentQuery } from "../../../application/queries/GetRunBinaryAttachmentQuery";
import { GetWorkflowOverlayBinaryAttachmentQuery } from "../../../application/queries/GetWorkflowOverlayBinaryAttachmentQuery";
import { ApplicationTokens } from "../../../applicationTokens";
import { ServerHttpErrorResponseFactory } from "../ServerHttpErrorResponseFactory";
import type { ServerHttpRouteParams } from "../ServerHttpRouteParams";

@injectable()
export class BinaryHttpRouteHandler {
  constructor(
    @inject(ApplicationTokens.QueryBus)
    private readonly queryBus: QueryBus,
    @inject(ApplicationTokens.CommandBus)
    private readonly commandBus: CommandBus,
    @inject(CoreTokens.BinaryStorage)
    private readonly binaryStorage: BinaryStorage,
  ) {}

  async getRunBinaryContent(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const attachment = await this.queryBus.execute(new GetRunBinaryAttachmentQuery(params.runId!, params.binaryId!));
      return await this.createBinaryResponse(attachment);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async getWorkflowOverlayBinaryContent(_: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const attachment = await this.queryBus.execute(
        new GetWorkflowOverlayBinaryAttachmentQuery(params.workflowId!, params.binaryId!),
      );
      return await this.createBinaryResponse(attachment);
    } catch (error) {
      return ServerHttpErrorResponseFactory.fromUnknown(error);
    }
  }

  async postWorkflowDebuggerOverlayBinaryUpload(request: Request, params: ServerHttpRouteParams): Promise<Response> {
    try {
      const workflowId = params.workflowId!;
      const form = await request.formData();
      const fileEntry = form.get("file");
      const nodeId = String(form.get("nodeId") ?? "").trim();
      const attachmentName = String(form.get("attachmentName") ?? "file").trim() || "file";
      const itemIndexRaw = form.get("itemIndex");
      const itemIndex = typeof itemIndexRaw === "string" ? Number.parseInt(itemIndexRaw, 10) : Number(itemIndexRaw);
      if (!nodeId) {
        return Response.json({ error: "nodeId is required" }, { status: 400 });
      }
      if (!Number.isFinite(itemIndex) || itemIndex < 0) {
        return Response.json({ error: "itemIndex must be a non-negative integer" }, { status: 400 });
      }
      if (!(fileEntry instanceof Blob) || fileEntry.size === 0) {
        return Response.json({ error: "file is required" }, { status: 400 });
      }
      const mimeType = fileEntry.type && fileEntry.type.trim() ? fileEntry.type : "application/octet-stream";
      const filename = fileEntry instanceof File ? fileEntry.name : undefined;
      /** `Blob#stream()` is a web `ReadableStream`; core `BinaryBody` uses the same stream type under Node’s typings. */
      const body = fileEntry.stream() as BinaryBody;
      const attachment = await this.commandBus.execute(
        new UploadOverlayPinnedBinaryCommand(workflowId, nodeId, itemIndex, attachmentName, mimeType, body, filename),
      );
      return Response.json({ attachment }, { status: 201 });
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
