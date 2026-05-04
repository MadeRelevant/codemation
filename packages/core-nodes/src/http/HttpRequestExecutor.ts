import type { Item } from "@codemation/core";
import type { HttpRequestResult, HttpRequestSpec } from "./httpRequest.types";
import type { HttpBodyBuilder } from "./HttpBodyBuilder";
import type { HttpUrlBuilder } from "./HttpUrlBuilder";

/**
 * Executes a single HTTP request described by {@link HttpRequestSpec}.
 *
 * - Credential sessions provide header/query deltas via `applyToRequest`.
 * - Body encoding is delegated to {@link HttpBodyBuilder}.
 * - URL query merging is delegated to {@link HttpUrlBuilder}.
 * - Binary response bodies: when `download.mode` triggers binary attach, the
 *   `bodyBinaryName` field is set in the result but the body is NOT read here.
 *   Callers that need binary attachment should use `buildRequest` to get the
 *   resolved URL + init and make the fetch + binary attach themselves.
 *
 * Collaborators (`fetch`, body builder, url builder) are injected so callers
 * own construction at composition roots and tests can supply deterministic stubs.
 */
export class HttpRequestExecutor {
  constructor(
    private readonly fetchFn: typeof globalThis.fetch,
    private readonly bodyBuilder: HttpBodyBuilder,
    private readonly urlBuilder: HttpUrlBuilder,
  ) {}

  /**
   * Builds the fetch init (headers, query, body) from the spec + credential delta,
   * returning both the resolved URL and the RequestInit so callers can make the
   * actual fetch call themselves (useful for streaming / binary attach).
   */
  async buildRequest(
    spec: HttpRequestSpec,
    item: Item,
  ): Promise<Readonly<{ url: string; init: RequestInit }>> {
    const credentialDelta = spec.credential?.applyToRequest(spec) ?? {};

    const mergedHeaders: Record<string, string> = {
      ...(spec.headers ?? {}),
      ...(credentialDelta.headers ?? {}),
    };

    const mergedQuery: Record<string, string | string[]> = {
      ...(spec.query ?? {}),
      ...(credentialDelta.query ?? {}),
    };

    const encodedBody = await this.bodyBuilder.build(spec.body, item, spec.ctx);

    // Only set Content-Type from the encoded body when it is non-empty
    // (empty string = FormData will set it automatically).
    if (encodedBody && encodedBody.contentType) {
      mergedHeaders["content-type"] = encodedBody.contentType;
    }

    const resolvedUrl = this.urlBuilder.build(spec.url, mergedQuery);

    const init: RequestInit = {
      method: spec.method,
      headers: mergedHeaders,
      ...(encodedBody ? { body: encodedBody.body } : {}),
    };

    return { url: resolvedUrl, init };
  }

  /**
   * Executes an HTTP request and returns parsed result.
   * For binary downloads (when `shouldAttachBody` is true), the body is NOT consumed
   * and callers must call `ctx.binary.attach` directly using the resolved URL + init
   * (available via `buildRequest`).
   */
  async execute(spec: HttpRequestSpec, item: Item): Promise<HttpRequestResult> {
    const { url: resolvedUrl, init } = await this.buildRequest(spec, item);

    const response = await this.fetchFn(resolvedUrl, init);

    const responseHeaders = this.readHeaders(response.headers);
    const mimeType = this.resolveMimeType(responseHeaders);

    const downloadMode = spec.download?.mode ?? "auto";
    const binaryName = spec.download?.binaryName ?? "body";
    const shouldDownload = this.shouldAttachBody(downloadMode, mimeType);

    const isJson = this.isJsonMimeType(mimeType);

    let json: unknown | undefined;
    let text: string | undefined;
    let bodyBinaryName: string | undefined;

    if (shouldDownload) {
      // Signal to caller that binary attachment is needed.
      bodyBinaryName = binaryName;
      // Do NOT read the body here — the caller must handle binary attach separately.
    } else if (isJson) {
      try {
        json = await response.json();
      } catch {
        text = await response.text();
      }
    } else {
      text = await response.text();
    }

    return {
      url: resolvedUrl,
      method: spec.method.toUpperCase(),
      status: response.status,
      ok: response.ok,
      statusText: response.statusText,
      mimeType,
      headers: responseHeaders,
      ...(json !== undefined ? { json } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(bodyBinaryName !== undefined ? { bodyBinaryName } : {}),
    };
  }

  private readHeaders(headers: Headers): Readonly<Record<string, string>> {
    const values: Record<string, string> = {};
    headers.forEach((value, key) => {
      values[key] = value;
    });
    return values;
  }

  private resolveMimeType(headers: Readonly<Record<string, string>>): string {
    const contentType = headers["content-type"];
    if (!contentType) {
      return "application/octet-stream";
    }
    return contentType.split(";")[0]?.trim() || "application/octet-stream";
  }

  private isJsonMimeType(mimeType: string): boolean {
    return mimeType === "application/json" || mimeType.endsWith("+json");
  }

  private shouldAttachBody(mode: "auto" | "always" | "never", mimeType: string): boolean {
    if (mode === "always") {
      return true;
    }
    if (mode === "never") {
      return false;
    }
    return (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("audio/") ||
      mimeType.startsWith("video/") ||
      mimeType === "application/pdf"
    );
  }
}
