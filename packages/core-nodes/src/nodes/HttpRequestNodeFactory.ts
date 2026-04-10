import type { Item, NodeExecutionContext, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

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
    const response = await fetch(url, {
      method: ctx.config.method,
    });
    const headers = this.readHeaders(response.headers);
    const mimeType = this.resolveMimeType(headers);
    const bodyBinaryName = ctx.config.binaryName;
    const shouldAttachBody = this.shouldAttachBody(ctx.config.downloadMode, mimeType);
    const outputJson: Readonly<Record<string, unknown>> = {
      url,
      method: ctx.config.method,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      mimeType,
      headers,
      ...(shouldAttachBody ? { bodyBinaryName } : {}),
    };

    let outputItem: Item = {
      json: outputJson,
    };
    if (!shouldAttachBody) {
      return outputItem;
    }

    const attachment = await ctx.binary.attach({
      name: bodyBinaryName,
      body: response.body
        ? (response.body as unknown as Parameters<typeof ctx.binary.attach>[0]["body"])
        : new Uint8Array(await response.arrayBuffer()),
      mimeType,
      filename: this.resolveFilename(url, headers),
    });
    outputItem = ctx.binary.withAttachment(outputItem, bodyBinaryName, attachment);
    return outputItem;
  }

  private resolveUrl(item: Item, ctx: NodeExecutionContext<HttpRequest<any, any>>): string {
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
