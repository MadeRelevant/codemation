import { defineNode } from "@codemation/core";
import type { DefinedNode, DefinedNodeCredentialBindings, NodeInspectorSummaryRow } from "@codemation/core";
import type { ZodType } from "zod";
import type { HttpBodySpec } from "../http/httpRequest.types";
import { HttpRequestExecutor } from "../http/HttpRequestExecutor";
import { HttpBodyBuilder } from "../http/HttpBodyBuilder";
import { HttpUrlBuilder } from "../http/HttpUrlBuilder";
import { SsrfGuard } from "../http/SsrfGuard";

type MaybePromise<T> = T | Promise<T>;

/**
 * API endpoint descriptor.
 */
export type RestNodeApi = Readonly<{
  /**
   * Base URL, e.g. `"https://api.slack.com"`.
   */
  baseUrl: string;
  /**
   * Path relative to `baseUrl`. May contain `{paramName}` placeholders that
   * are substituted from `input` keys before the request is made.
   * Example: `"/users/{userId}/profile"`
   */
  path: string;
  /** HTTP method (default: GET). */
  method?: string;
}>;

/**
 * The HTTP result shape passed into the `response` mapper.
 */
export type RestNodeResponseContext = Readonly<{
  status: number;
  ok: boolean;
  statusText: string;
  mimeType: string;
  headers: Readonly<Record<string, string>>;
  json?: unknown;
  text?: string;
}>;

/**
 * What the `request` callback may return to customise the request.
 */
export type RestNodeRequestShape = Readonly<{
  /** Additional path parameters to substitute (merged with `input`). */
  pathParams?: Readonly<Record<string, string>>;
  /** Extra query params. */
  query?: Readonly<Record<string, string>>;
  /** Extra headers. */
  headers?: Readonly<Record<string, string>>;
  /** Request body. */
  body?: HttpBodySpec;
}>;

/**
 * Error handling policy for non-2xx responses.
 *  - `"throw"` (default) — throws an `Error` for non-2xx responses.
 *  - `"passthrough"` — returns the result regardless of status.
 */
export type RestNodeErrorPolicy = "throw" | "passthrough";

export interface DefineRestNodeOptions<
  TKey extends string,
  TCredentials extends DefinedNodeCredentialBindings | undefined,
  TInputJson,
  TOutputJson,
> {
  readonly key: TKey;
  readonly title: string;
  readonly description?: string;
  readonly icon?: string;
  readonly api: RestNodeApi;
  /**
   * Credential bindings keyed by slot. Use the built-in credential types from
   * `@codemation/core-nodes` (e.g. `bearerTokenCredentialType`) or any custom one.
   * The slot key must match what the `request` callback's context uses.
   */
  readonly credentials?: TCredentials;
  /**
   * Zod schema for per-item input. Validated before `execute`.
   */
  readonly inputSchema?: ZodType<TInputJson>;
  /**
   * Builds the per-request customisations from the item input.
   * Return `body`, `query`, `headers`, and/or `pathParams`.
   */
  request?(context: Readonly<{ input: TInputJson }>): MaybePromise<RestNodeRequestShape>;
  /**
   * Maps the HTTP response to the node's output JSON.
   * When omitted, the output is `{ status, ok, statusText, mimeType, headers, json, text }`.
   */
  response?(context: RestNodeResponseContext & Readonly<{ input: TInputJson }>): MaybePromise<TOutputJson>;
  /**
   * How to handle non-2xx responses.
   * @default "throw"
   */
  readonly errorPolicy?: RestNodeErrorPolicy;
  /**
   * Static configuration summary surfaced in the workflow inspector.
   * Receives the static config (empty record for defineRestNode — config lives on item input).
   * Most callers return rows based on the static `api` descriptor instead.
   */
  readonly inspectorSummary?: (
    args: Readonly<{ config: Record<string, never> }>,
  ) => ReadonlyArray<NodeInspectorSummaryRow> | undefined;
}

/**
 * Substitutes `{name}` placeholders in a path template using values from `params`.
 */
function substitutePath(template: string, params: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{([^}]+)}/g, (_match, key: string) => {
    const value = params[key];
    return value !== undefined ? String(value) : `{${key}}`;
  });
}

/**
 * Declarative helper for creating thin API-wrapper nodes.
 *
 * Usage:
 * ```ts
 * export const postMessage = defineRestNode({
 *   key: "slack.post-message",
 *   title: "Send Slack message",
 *   icon: "si:slack",
 *   api: { baseUrl: "https://slack.com/api", path: "/chat.postMessage", method: "POST" },
 *   credentials: { auth: bearerTokenCredentialType },
 *   inputSchema: z.object({ channel: z.string(), text: z.string() }),
 *   request: ({ input }) => ({
 *     body: { kind: "json", data: { channel: input.channel, text: input.text } },
 *   }),
 *   response: ({ json }) => ({ messageTs: (json as any).ts }),
 * });
 * ```
 *
 * - `defineRestNode` is a thin wrapper over `defineNode`; it does not introduce a new runtime kind.
 * - Credential sessions are resolved via the `credentials` binding map (same as `defineNode`).
 * - Path `{placeholder}` substitution is applied from `input` keys before the request is made.
 * - Non-2xx responses throw an `Error` by default (`errorPolicy: "throw"`).
 */
export function defineRestNode<
  TKey extends string,
  TCredentials extends DefinedNodeCredentialBindings | undefined,
  TInputJson,
  TOutputJson = RestNodeResponseContext,
>(
  options: DefineRestNodeOptions<TKey, TCredentials, TInputJson, TOutputJson>,
): DefinedNode<TKey, Record<string, never>, TInputJson, TOutputJson, TCredentials> {
  const errorPolicy = options.errorPolicy ?? "throw";

  return defineNode<TKey, Record<string, never>, TInputJson, TOutputJson, TCredentials>({
    key: options.key,
    title: options.title,
    description: options.description,
    icon: options.icon,
    credentials: options.credentials,
    inputSchema: options.inputSchema,
    inspectorSummary: options.inspectorSummary,
    async execute({ input, item, ctx }, { credentials }) {
      // Resolve credential if one is bound.
      const credentialSlot = options.credentials ? Object.keys(options.credentials)[0] : undefined;
      const credential = credentialSlot
        ? await (credentials as Record<string, () => Promise<unknown>>)[credentialSlot]?.()
        : undefined;

      // Build path by substituting `{name}` placeholders from input.
      const inputRecord = (input as Record<string, unknown>) ?? {};
      const requestShape = options.request ? await options.request({ input }) : {};
      const pathParams = { ...inputRecord, ...(requestShape.pathParams ?? {}) };
      const resolvedPath = substitutePath(options.api.path, pathParams);
      const resolvedUrl = `${options.api.baseUrl}${resolvedPath}`;

      const executor = new HttpRequestExecutor(
        globalThis.fetch,
        new HttpBodyBuilder(),
        new HttpUrlBuilder(),
        new SsrfGuard(),
      );
      const result = await executor.execute(
        {
          url: resolvedUrl,
          method: (options.api.method ?? "GET").toUpperCase(),
          headers: requestShape.headers,
          query: requestShape.query,
          body: requestShape.body,
          credential: credential as Parameters<typeof executor.execute>[0]["credential"],
          ctx: ctx as unknown as Parameters<typeof executor.execute>[0]["ctx"],
        },
        item,
      );

      if (errorPolicy === "throw" && !result.ok) {
        throw new Error(`HTTP ${result.status} ${result.statusText} for ${result.method} ${result.url}`);
      }

      const responseCtx: RestNodeResponseContext = {
        status: result.status,
        ok: result.ok,
        statusText: result.statusText,
        mimeType: result.mimeType,
        headers: result.headers,
        ...(result.json !== undefined ? { json: result.json } : {}),
        ...(result.text !== undefined ? { text: result.text } : {}),
      };

      if (options.response) {
        return await options.response({ ...responseCtx, input });
      }

      // Wrap in `{ json: ... }` so the engine's Item-shape detection unwraps once
      // and the response context becomes the item's payload as-is (preserving the
      // inner `json` field on the response for callers).
      return { json: responseCtx } as unknown as TOutputJson;
    },
  }) as unknown as DefinedNode<TKey, Record<string, never>, TInputJson, TOutputJson, TCredentials>;
}
