import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { Item, NodeExecutionContext } from "@codemation/core";
import type { RunnableNodeConfig } from "@codemation/core";
import type { HttpBodySpec } from "./httpRequest.types";

export type EncodedBody = Readonly<{
  body: NonNullable<RequestInit["body"]>;
  /**
   * Desired Content-Type header. Empty string means `fetch` should set it automatically
   * (used for multipart/form-data so the boundary is set correctly by the browser/Node runtime).
   */
  contentType: string;
}>;

/**
 * Builds a fetch-compatible `BodyInit` + Content-Type pair from an {@link HttpBodySpec}.
 * Multipart binaries are read from `item.binary` via `ctx.binary.openReadStream`.
 */
export class HttpBodyBuilder {
  async build(
    spec: HttpBodySpec | undefined,
    item: Item,
    ctx: NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>,
  ): Promise<EncodedBody | undefined> {
    if (!spec || spec.kind === "none") {
      return undefined;
    }

    if (spec.kind === "json") {
      return {
        body: JSON.stringify(spec.data),
        contentType: "application/json",
      };
    }

    if (spec.kind === "form") {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(spec.data)) {
        params.append(key, value);
      }
      return {
        body: params.toString(),
        contentType: "application/x-www-form-urlencoded",
      };
    }

    if (spec.kind === "multipart") {
      const formData = new FormData();
      for (const [key, value] of Object.entries(spec.fields)) {
        formData.append(key, value);
      }
      if (spec.binaries) {
        for (const [fieldName, binaryRef] of Object.entries(spec.binaries)) {
          const attachment = item.binary?.[binaryRef];
          if (attachment) {
            const readResult = await ctx.binary.openReadStream(attachment);
            if (readResult) {
              const merged = await this.readStreamToBuffer(readResult.body);
              const blob = new Blob([merged], { type: attachment.mimeType });
              formData.append(fieldName, blob, attachment.filename ?? binaryRef);
            }
          }
        }
      }
      // FormData sets its own Content-Type with boundary; empty string signals that
      // fetch should set it automatically.
      return {
        body: formData,
        contentType: "",
      };
    }

    if (spec.kind === "binary") {
      const attachment = item.binary?.[spec.slot];
      if (!attachment) {
        throw new Error(
          `HttpRequest bodyFormat "binary": no binary attachment found at slot "${spec.slot}". ` +
            `Ensure a previous node attached binary data at that slot.`,
        );
      }
      const readResult = await ctx.binary.openReadStream(attachment);
      if (!readResult) {
        throw new Error(`HttpRequest bodyFormat "binary": could not open read stream for slot "${spec.slot}".`);
      }
      const merged = await this.readStreamToBuffer(readResult.body);
      return {
        body: merged,
        contentType: attachment.mimeType,
      };
    }

    return undefined;
  }

  private async readStreamToBuffer(stream: NodeReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        chunks.push(result.value);
      }
    }
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const merged = new Uint8Array(new ArrayBuffer(totalLength));
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }
}
