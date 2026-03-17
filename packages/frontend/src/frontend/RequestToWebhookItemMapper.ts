import type { Item } from "@codemation/core";

import { injectable } from "@codemation/core";

@injectable()
export class RequestToWebhookItemMapper {
  async map(request: Request, parseJsonBody?: (body: unknown) => unknown): Promise<Item> {
    const url = new URL(request.url);
    const bodyText = await request.text();
    const parsedJsonBody = this.parseJsonBody(bodyText, request, parseJsonBody);
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
