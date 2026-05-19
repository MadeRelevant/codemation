import type { Item, NodeExecutionContext, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";
import type { CredentialSession, HttpRequestSpec } from "../http/httpRequest.types";
import { HttpRequestExecutor } from "../http/HttpRequestExecutor";
import { HttpBodyBuilder } from "../http/HttpBodyBuilder";
import { HttpUrlBuilder } from "../http/HttpUrlBuilder";
import { SsrfGuard } from "../http/SsrfGuard";
import type { HttpRequestDownloadMode } from "./httpRequest";
import { HttpRequest } from "./httpRequest";

@node({ packageName: "@codemation/core-nodes" })
export class HttpRequestNode implements RunnableNode<HttpRequest<any, any>> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<HttpRequest<any, any>>): Promise<unknown> {
    return await this.executeItem(args.item, args.ctx);
  }

  private async executeItem(item: Item, ctx: NodeExecutionContext<HttpRequest<any, any>>): Promise<Item> {
    const url = this.resolveUrl(item, ctx);
    const credential = await this.resolveCredential(ctx);

    const spec: HttpRequestSpec = {
      url,
      method: ctx.config.method,
      headers: ctx.config.args.headers,
      query: ctx.config.args.query,
      body: ctx.config.args.body,
      credential,
      download: {
        mode: ctx.config.downloadMode,
        binaryName: ctx.config.binaryName,
      },
      responseFormat: ctx.config.responseFormat,
      responseBinarySlot: ctx.config.responseBinarySlot,
      responseSizeCapBytes: ctx.config.responseSizeCapBytes,
      ctx: ctx as unknown as HttpRequestSpec["ctx"],
    };

    // Build the request (headers, body encoding, URL query merge) once,
    // then make a SINGLE fetch call and decide what to do with the response.
    // This avoids a double-fetch regression for auto-mode binary responses.
    const executor = new HttpRequestExecutor(
      globalThis.fetch,
      new HttpBodyBuilder(),
      new HttpUrlBuilder(),
      new SsrfGuard(),
    );
    const { url: resolvedUrl, init } = await executor.buildRequest(spec, item);

    const response = await globalThis.fetch(resolvedUrl, init);

    const headers = this.readHeaders(response.headers);
    const mimeType = this.resolveMimeType(headers);

    // New explicit responseFormat="binary" path — takes precedence over downloadMode.
    if (ctx.config.responseFormat === "binary") {
      return await this.handleBinaryResponse(response, resolvedUrl, headers, mimeType, ctx);
    }

    const binaryName = ctx.config.binaryName;
    const shouldAttach = this.shouldAttachBody(ctx.config.downloadMode, mimeType);

    if (shouldAttach) {
      const outputJson: Readonly<Record<string, unknown>> = {
        url: resolvedUrl,
        method: ctx.config.method,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        mimeType,
        headers,
        bodyBinaryName: binaryName,
      };

      const attachment = await ctx.binary.attach({
        name: binaryName,
        body: response.body
          ? (response.body as unknown as Parameters<typeof ctx.binary.attach>[0]["body"])
          : // eslint-disable-next-line codemation/no-buffer-everything -- response.body is null (e.g. 204/304); fallback path is intentional and bounded.
            new Uint8Array(await response.arrayBuffer()),
        mimeType,
        filename: this.resolveFilename(resolvedUrl, headers),
      });

      let outputItem: Item = { json: outputJson };
      outputItem = ctx.binary.withAttachment(outputItem, binaryName, attachment);
      return outputItem;
    }

    // Non-binary path: parse JSON or read text.
    const isJson = this.isJsonMimeType(mimeType);
    let json: unknown | undefined;
    let text: string | undefined;

    if (isJson) {
      try {
        json = await response.json();
      } catch {
        text = await response.text();
      }
    } else {
      text = await response.text();
    }

    const outputJson: Readonly<Record<string, unknown>> = {
      url: resolvedUrl,
      method: ctx.config.method,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      mimeType,
      headers,
      ...(json !== undefined ? { json } : {}),
      ...(text !== undefined ? { text } : {}),
    };

    return { json: outputJson };
  }

  private async handleBinaryResponse(
    response: Response,
    resolvedUrl: string,
    headers: Readonly<Record<string, string>>,
    mimeType: string,
    ctx: NodeExecutionContext<HttpRequest<any, any>>,
  ): Promise<Item> {
    const slotName = ctx.config.responseBinarySlot;
    const sizeCap = ctx.config.responseSizeCapBytes;

    // Check Content-Length against size cap before allocating.
    const contentLengthHeader = headers["content-length"];
    if (contentLengthHeader) {
      const declaredSize = parseInt(contentLengthHeader, 10);
      if (!isNaN(declaredSize) && declaredSize > sizeCap) {
        throw new Error(
          `HttpRequest responseFormat "binary": response Content-Length (${declaredSize} bytes) ` +
            `exceeds responseSizeCapBytes (${sizeCap} bytes).`,
        );
      }
    }

    const filename = this.resolveFilename(resolvedUrl, headers);

    // Stream response.body straight into binary storage — never load the
    // whole payload into memory. ctx.binary.attach accepts ReadableStream
    // natively. Falls back to arrayBuffer only when response.body is null
    // (rare; 204/304-style responses where the cap-check above already
    // covers the meaningful size case).
    const attachment = await ctx.binary.attach({
      name: slotName,
      body: response.body
        ? (response.body as unknown as Parameters<typeof ctx.binary.attach>[0]["body"])
        : // eslint-disable-next-line codemation/no-buffer-everything -- response.body is null on 204/304-style empty responses; the size-cap check above already gates large bodies, so buffering an empty payload here is bounded and unavoidable.
          new Uint8Array(await response.arrayBuffer()),
      mimeType,
      filename,
    });

    const outputJson: Readonly<Record<string, unknown>> = {
      url: resolvedUrl,
      method: ctx.config.method,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers,
      binarySlot: slotName,
      contentType: mimeType,
      // Reported by the binary storage adapter after streaming completes.
      size: attachment.size,
      ...(filename !== undefined ? { filename } : {}),
    };

    let outputItem: Item = { json: outputJson };
    outputItem = ctx.binary.withAttachment(outputItem, slotName, attachment);
    return outputItem;
  }

  private async resolveCredential(
    ctx: NodeExecutionContext<HttpRequest<any, any>>,
  ): Promise<CredentialSession | undefined> {
    const rawSlot = ctx.config.args.credentialSlot;
    if (!rawSlot) {
      return undefined;
    }
    const slotKey = typeof rawSlot === "string" ? rawSlot : rawSlot.name;
    try {
      return await ctx.getCredential<CredentialSession>(slotKey);
    } catch {
      // Credential slot configured but not bound — treat as no credential.
      return undefined;
    }
  }

  private resolveUrl(item: Item, ctx: NodeExecutionContext<HttpRequest<any, any>>): string {
    // Literal URL in args takes precedence over the legacy urlField approach.
    const literalUrl = ctx.config.args.url;
    if (literalUrl && literalUrl.trim().length > 0) {
      return literalUrl.trim();
    }

    const json = this.asRecord(item.json);
    const candidate = json[ctx.config.urlField];
    if (typeof candidate !== "string" || candidate.trim() === "") {
      throw new Error(`HttpRequest node expected item.json.${ctx.config.urlField} to contain a URL string.`);
    }
    return candidate;
  }

  private asRecord(value: unknown): Readonly<Record<string, unknown>> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Readonly<Record<string, unknown>>;
    }
    return { input: value };
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

  private shouldAttachBody(mode: HttpRequestDownloadMode, mimeType: string): boolean {
    if (mode === "always") {
      return true;
    }
    if (mode === "never") {
      return false;
    }
    return mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/");
  }

  private resolveFilename(url: string, headers: Readonly<Record<string, string>>): string | undefined {
    const contentDisposition = headers["content-disposition"];
    const fromDisposition = this.readFilenameFromContentDisposition(contentDisposition);
    if (fromDisposition) {
      return fromDisposition;
    }
    const pathname = new URL(url).pathname;
    const value = pathname.split("/").at(-1);
    return value && value.trim() ? value : undefined;
  }

  private readFilenameFromContentDisposition(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const parts = value.split(";");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith("filename=")) {
        continue;
      }
      return trimmed.slice("filename=".length).replace(/^"|"$/g, "");
    }
    return undefined;
  }
}
