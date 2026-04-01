import { RetryPolicy, type RetryPolicySpec, type RunnableNodeConfig, type TypeToken } from "@codemation/core";

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
  bodyBinaryName?: string;
}>;

export class HttpRequest<
  TInputJson = Readonly<{ url?: string }>,
  TOutputJson = HttpRequestOutputJson,
> implements RunnableNodeConfig<TInputJson, TOutputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = HttpRequestNode;
  readonly execution = { hint: "local" } as const;

  constructor(
    public readonly name: string,
    public readonly args: Readonly<{
      method?: string;
      urlField?: string;
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
}

export { HttpRequestNode } from "./HttpRequestNodeFactory";
