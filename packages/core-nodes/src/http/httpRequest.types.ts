import type { NodeExecutionContext } from "@codemation/core";
import type { RunnableNodeConfig } from "@codemation/core";

/**
 * Binary reference key into `item.binary`.
 */
export type BinaryRef = string;

/**
 * Discriminated union for the HTTP request body.
 */
export type HttpBodySpec =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "json"; data: unknown }>
  | Readonly<{ kind: "form"; data: Readonly<Record<string, string>> }>
  | Readonly<{
      kind: "multipart";
      fields: Readonly<Record<string, string>>;
      binaries?: Readonly<Record<string, BinaryRef>>;
    }>
  | Readonly<{
      /**
       * Send raw bytes from a binary slot as the request body.
       * The binary attachment's `mimeType` is used as `Content-Type` unless
       * the request `headers` map already contains `content-type`.
       */
      kind: "binary";
      /** Key into `item.binary` to read the request body bytes from. */
      slot: string;
    }>;

/**
 * Session interface that credential types implement.
 * Returns header/query deltas so the executor can merge them without
 * mutating the immutable HttpRequestSpec.
 */
export interface CredentialSession {
  applyToRequest(spec: HttpRequestSpec): HttpCredentialDelta;
}

/**
 * Mutations the credential session wants to apply to the outgoing request.
 */
export type HttpCredentialDelta = Readonly<{
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
}>;

/**
 * Full specification of one HTTP request. All URLs are fully resolved before
 * being passed here (template substitution already applied by the caller).
 */
export type HttpRequestSpec = Readonly<{
  url: string;
  method: string;
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string | string[]>>;
  body?: HttpBodySpec;
  credential?: CredentialSession;
  download?: Readonly<{ mode: "auto" | "always" | "never"; binaryName: string }>;
  /**
   * When set to `"binary"`, the response body is written to a binary slot
   * instead of being parsed as JSON/text. Overrides `download` mode.
   */
  responseFormat?: "json" | "text" | "binary";
  /** Binary slot name for the response body when `responseFormat === "binary"`. Defaults to `"response"`. */
  responseBinarySlot?: string;
  /** Maximum allowed response size in bytes (checked against Content-Length before allocating). Defaults to 100 MiB. */
  responseSizeCapBytes?: number;
  /**
   * When `false` (default), requests whose target host resolves to an RFC-1918,
   * link-local (169.254/16), or loopback address are blocked to prevent SSRF attacks.
   * Set to `true` only for workflows that intentionally reach private infrastructure.
   */
  allowPrivateNetworkTargets?: boolean;
  /** Execution context — needed for binary attach. */
  ctx: NodeExecutionContext<RunnableNodeConfig<unknown, unknown>>;
}>;

/**
 * Result of executing an HTTP request.
 */
export type HttpRequestResult = Readonly<{
  url: string;
  method: string;
  status: number;
  ok: boolean;
  statusText: string;
  mimeType: string;
  headers: Readonly<Record<string, string>>;
  json?: unknown;
  text?: string;
  bodyBinaryName?: string;
  /** Set when `responseFormat === "binary"`. Name of the binary slot the response body was written to. */
  binarySlot?: string;
  /** Set when `responseFormat === "binary"`. The MIME type of the stored response. */
  contentType?: string;
  /** Set when `responseFormat === "binary"`. Size in bytes of the stored response. */
  size?: number;
  /** Set when `responseFormat === "binary"`. Filename inferred from URL or Content-Disposition. */
  filename?: string;
}>;
