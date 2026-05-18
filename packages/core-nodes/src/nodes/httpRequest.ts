import {
  RetryPolicy,
  type AnyCredentialType,
  type CredentialRequirement,
  type NodeInspectorSummaryRow,
  type RetryPolicySpec,
  type RunnableNodeConfig,
  type TypeToken,
} from "@codemation/core";
import type { HttpBodySpec } from "../http/httpRequest.types";
import {
  apiKeyCredentialType,
  basicAuthCredentialType,
  bearerTokenCredentialType,
  oauth2ClientCredentialsType,
} from "../credentials/index";
import { HttpRequestNode } from "./HttpRequestNodeFactory";

export type HttpRequestDownloadMode = "auto" | "always" | "never";

/** JSON emitted by {@link HttpRequest} — response metadata only (input item fields are not passed through). */
export type HttpRequestOutputJson = Readonly<{
  url: string;
  method: string;
  ok: boolean;
  status: number;
  statusText: string;
  mimeType: string;
  headers: Readonly<Record<string, string>>;
  json?: unknown;
  text?: string;
  bodyBinaryName?: string;
  /** Set when `responseFormat === "binary"`. Name of the binary slot the response was stored in. */
  binarySlot?: string;
  /** Set when `responseFormat === "binary"`. MIME type of the stored response. */
  contentType?: string;
  /** Set when `responseFormat === "binary"`. Size in bytes of the stored response. */
  size?: number;
  /** Set when `responseFormat === "binary"`. Filename inferred from URL or Content-Disposition. */
  filename?: string;
}>;

/**
 * The built-in HTTP request credential type IDs accepted by the `HttpRequest` node.
 * These match the four generic credential types shipped with `@codemation/core-nodes`.
 */
export const HTTP_REQUEST_ACCEPTED_CREDENTIAL_TYPES: ReadonlyArray<string> = [
  bearerTokenCredentialType.definition.typeId,
  apiKeyCredentialType.definition.typeId,
  basicAuthCredentialType.definition.typeId,
  oauth2ClientCredentialsType.definition.typeId,
] as const;

/** Default maximum response size for binary mode: 100 MiB. */
const DEFAULT_RESPONSE_SIZE_CAP_BYTES = 100 * 1024 * 1024;

export class HttpRequest<
  TInputJson = Readonly<{ url?: string }>,
  TOutputJson = HttpRequestOutputJson,
> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = HttpRequestNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:globe" as const;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{
      /** HTTP method (default: GET). */
      method?: string;
      /**
       * Legacy: field name on item.json to read the URL from.
       * Use `url` for a literal/templated URL instead.
       */
      urlField?: string;
      /** Literal or templated URL. When present, takes precedence over `urlField`. */
      url?: string;
      /** Extra headers to add to every request. */
      headers?: Readonly<Record<string, string>>;
      /** Query parameters to append to the URL. */
      query?: Readonly<Record<string, string>>;
      /** Request body specification. For canvas use, pass a JSON string in `body.data`. */
      body?: HttpBodySpec;
      /**
       * Credential slot.
       *
       * **String shorthand** (existing): `credentialSlot: "auth"` — the slot accepts all four
       * default HTTP credential types (bearer, API-key, basic, OAuth2).
       *
       * **Object form** (new): narrows the accepted types to the caller-supplied list, useful
       * when only a subset of credential types makes sense for a specific endpoint.
       * ```ts
       * credentialSlot: { name: "auth", acceptedTypes: [bearerTokenCredentialType] }
       * ```
       * The slot must be declared in `getCredentialRequirements()`, which is wired automatically.
       */
      credentialSlot?: string | Readonly<{ name: string; acceptedTypes?: ReadonlyArray<AnyCredentialType> }>;
      binaryName?: string;
      downloadMode?: HttpRequestDownloadMode;
      /**
       * Controls how the response body is handled.
       * - `"json"` / `"text"`: existing behaviour (parse + emit on `item.json`).
       * - `"binary"`: read the response as raw bytes and store via `ctx.binary.attach`.
       *   The output JSON contains `{ status, headers, binarySlot, contentType, size, filename }`
       *   but NOT the raw bytes. Use `responseBinarySlot` to name the slot (default `"response"`).
       *
       * When omitted, the existing `downloadMode` logic applies (backward-compatible).
       */
      responseFormat?: "json" | "text" | "binary";
      /**
       * Name of the binary slot to write the response body into when `responseFormat === "binary"`.
       * Defaults to `"response"`.
       */
      responseBinarySlot?: string;
      /**
       * Maximum response size in bytes for binary mode. Checked against the `Content-Length`
       * response header before allocating memory. Defaults to 100 MiB (104857600).
       * Requests whose `Content-Length` exceeds this cap are rejected before the body is read.
       */
      responseSizeCapBytes?: number;
      id?: string;
    }> = {},
    public readonly retryPolicy: RetryPolicySpec = RetryPolicy.defaultForHttp,
  ) {}

  get id(): string | undefined {
    return this.args.id;
  }

  get method(): string {
    return (this.args.method ?? "GET").toUpperCase();
  }

  get urlField(): string {
    return this.args.urlField ?? "url";
  }

  get binaryName(): string {
    return this.args.binaryName ?? "body";
  }

  get downloadMode(): HttpRequestDownloadMode {
    return this.args.downloadMode ?? "auto";
  }

  get responseFormat(): "json" | "text" | "binary" | undefined {
    return this.args.responseFormat;
  }

  get responseBinarySlot(): string {
    return this.args.responseBinarySlot ?? "response";
  }

  get responseSizeCapBytes(): number {
    return this.args.responseSizeCapBytes ?? DEFAULT_RESPONSE_SIZE_CAP_BYTES;
  }

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    const slot = this.args.credentialSlot;
    if (!slot) {
      return [];
    }
    if (typeof slot === "string") {
      return [
        {
          slotKey: slot,
          label: "Authentication",
          acceptedTypes: HTTP_REQUEST_ACCEPTED_CREDENTIAL_TYPES,
          optional: true,
          helpText: "Optional credential for authenticating the HTTP request.",
        },
      ];
    }
    // Object form: use caller-supplied acceptedTypes (mapped to typeIds), falling back to all defaults.
    const acceptedTypes =
      slot.acceptedTypes && slot.acceptedTypes.length > 0
        ? slot.acceptedTypes.map((ct) => ct.definition.typeId)
        : HTTP_REQUEST_ACCEPTED_CREDENTIAL_TYPES;
    return [
      {
        slotKey: slot.name,
        label: "Authentication",
        acceptedTypes,
        optional: true,
        helpText: "Optional credential for authenticating the HTTP request.",
      },
    ];
  }

  inspectorSummary(): ReadonlyArray<NodeInspectorSummaryRow> {
    const rows: NodeInspectorSummaryRow[] = [{ label: "Method", value: this.method }];
    if (this.args.url) {
      const url = this.args.url.length > 80 ? `${this.args.url.slice(0, 79)}…` : this.args.url;
      rows.push({ label: "URL", value: url });
    } else if (this.args.urlField) {
      rows.push({ label: "URL field", value: this.args.urlField });
    }
    if (this.args.responseFormat) {
      rows.push({ label: "Response format", value: this.args.responseFormat });
    }
    if (this.args.body && this.args.body.kind !== "none") {
      rows.push({ label: "Body", value: this.args.body.kind });
    }
    return rows;
  }
}

export { HttpRequestNode } from "./HttpRequestNodeFactory";
