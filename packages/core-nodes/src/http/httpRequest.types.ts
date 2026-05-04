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
}>;
