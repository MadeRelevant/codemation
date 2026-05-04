import {
  RetryPolicy,
  type CredentialRequirement,
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
       * Credential slot key. When set, the node resolves a credential via
       * `ctx.getCredential(credentialSlot)` and applies it to the request.
       * The slot must be declared in `getCredentialRequirements()`.
       */
      credentialSlot?: string;
      binaryName?: string;
      downloadMode?: HttpRequestDownloadMode;
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

  getCredentialRequirements(): ReadonlyArray<CredentialRequirement> {
    if (!this.args.credentialSlot) {
      return [];
    }
    return [
      {
        slotKey: this.args.credentialSlot,
        label: "Authentication",
        acceptedTypes: HTTP_REQUEST_ACCEPTED_CREDENTIAL_TYPES,
        optional: true,
        helpText: "Optional credential for authenticating the HTTP request.",
      },
    ];
  }
}

export { HttpRequestNode } from "./HttpRequestNodeFactory";
