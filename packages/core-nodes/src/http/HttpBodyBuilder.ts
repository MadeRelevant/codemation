import type { Item, NodeExecutionContext } from "@codemation/core";
import type { RunnableNodeConfig } from "@codemation/core";
import type { HttpBodySpec } from "./httpRequest.types";

export type EncodedBody = Readonly<{
  body: string | FormData | URLSearchParams | Uint8Array | ArrayBuffer;
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
              const reader = readResult.body.getReader();
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
              const merged = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
              }
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

    return undefined;
  }
}
