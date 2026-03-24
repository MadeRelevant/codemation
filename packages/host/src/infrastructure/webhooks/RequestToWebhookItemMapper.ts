import type {
  ActivationIdFactory,
  BinaryAttachment,
  BinaryBody,
  BinaryStorage,
  Item,
  ItemBinary,
  RunIdFactory,
  WebhookInvocationMatch,
} from "@codemation/core";
import { CoreTokens, DefaultExecutionBinaryService, inject, injectable } from "@codemation/core";

@injectable()
export class RequestToWebhookItemMapper {
  constructor(
    @inject(CoreTokens.BinaryStorage)
    private readonly binaryStorage: BinaryStorage,
    @inject(CoreTokens.RunIdFactory)
    private readonly runIdFactory: RunIdFactory,
    @inject(CoreTokens.ActivationIdFactory)
    private readonly activationIdFactory: ActivationIdFactory,
  ) {}

  async map(request: Request, match: WebhookInvocationMatch): Promise<Item> {
    const url = new URL(request.url);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      return await this.mapMultipart(request, match, url);
    }
    const bodyText = await request.text();
    const parsedJsonBody = this.parseJsonBody(bodyText, request, match.parseJsonBody);
    const body = parsedJsonBody.didParse ? parsedJsonBody.raw : this.resolveBody(bodyText);
    const json = parsedJsonBody.didParse ? parsedJsonBody.value : undefined;

    return {
      json: {
        headers: this.toHeaders(request),
        ...(body === undefined ? {} : { body }),
        ...(json === undefined ? {} : { json }),
        method: request.method.toUpperCase(),
        url: request.url,
        query: this.toQuery(url),
      },
    };
  }

  private async mapMultipart(request: Request, match: WebhookInvocationMatch, url: URL): Promise<Item> {
    const formData = await request.formData();
    const ingressRunId = `webhook-ingress-${this.runIdFactory.makeRunId()}`;
    const ingressActivationId = `webhook-ingress-${this.activationIdFactory.makeActivationId()}`;
    const binaryService = new DefaultExecutionBinaryService(
      this.binaryStorage,
      match.workflowId,
      ingressRunId,
      () => new Date(),
    );
    const nodeBinary = binaryService.forNode({
      nodeId: match.nodeId,
      activationId: ingressActivationId,
    });
    const formFields: Record<string, string> = {};
    const binaryParts: Record<string, BinaryAttachment> = {};
    for (const [key, value] of formData as unknown as Iterable<[string, string | File]>) {
      if (value instanceof File) {
        const attachment = await nodeBinary.attach({
          name: key,
          body: value.stream() as BinaryBody,
          mimeType: value.type || "application/octet-stream",
          filename: value.name,
        });
        binaryParts[key] = attachment;
      } else {
        formFields[key] = value;
      }
    }
    const binary: ItemBinary | undefined = Object.keys(binaryParts).length > 0 ? binaryParts : undefined;
    return {
      json: {
        headers: this.toHeaders(request),
        method: request.method.toUpperCase(),
        url: request.url,
        query: this.toQuery(url),
        formFields,
      },
      binary,
    };
  }

  private parseJsonBody(
    bodyText: string,
    request: Request,
    parseJsonBody: ((body: unknown) => unknown) | undefined,
  ): Readonly<{ didParse: boolean; raw?: unknown; value?: unknown }> {
    if (!bodyText) return { didParse: false };
    if (!parseJsonBody && !this.isJsonRequest(request)) return { didParse: false };

    const raw = JSON.parse(bodyText) as unknown;
    return {
      didParse: true,
      raw,
      value: parseJsonBody ? parseJsonBody(raw) : raw,
    };
  }

  private isJsonRequest(request: Request): boolean {
    return request.headers.get("content-type")?.toLowerCase().includes("application/json") ?? false;
  }

  private resolveBody(bodyText: string): string | undefined {
    return bodyText ? bodyText : undefined;
  }

  private toHeaders(request: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  private toQuery(url: URL): Record<string, string> {
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    return query;
  }
}
