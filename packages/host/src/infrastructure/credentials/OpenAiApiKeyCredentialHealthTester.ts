import type { CredentialHealth, CredentialSessionFactoryArgs } from "@codemation/core";

import type { OpenAiApiKeyMaterial, OpenAiApiKeyPublicConfig } from "./OpenAiApiKeyCredentialShapes.types";

/**
 * Verifies an OpenAI-compatible API key by calling the provider's models list endpoint
 * (GET `/v1/models` relative to the configured base URL).
 */
export class OpenAiApiKeyCredentialHealthTester {
  constructor(private readonly fetchImpl: typeof globalThis.fetch) {}

  async test(
    args: CredentialSessionFactoryArgs<OpenAiApiKeyPublicConfig, OpenAiApiKeyMaterial>,
  ): Promise<CredentialHealth> {
    const testedAt = new Date().toISOString();
    const apiKey = String(args.material.apiKey ?? "").trim();
    if (apiKey.length === 0) {
      return {
        status: "failing",
        message: "OpenAI API key is empty.",
        testedAt,
      };
    }

    const modelsUrl = this.resolveModelsListUrl(args.publicConfig.baseUrl);

    try {
      const response = await this.fetchImpl(modelsUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(25_000),
      });

      if (response.ok) {
        return {
          status: "healthy",
          message: "API key verified against the models endpoint.",
          testedAt,
        };
      }

      const message = await this.parseErrorMessage(response);
      return {
        status: "failing",
        message,
        testedAt,
      };
    } catch (error) {
      return {
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
        testedAt,
      };
    }
  }

  private resolveModelsListUrl(baseUrlRaw: unknown): string {
    const defaultBase = "https://api.openai.com/v1";
    const raw = typeof baseUrlRaw === "string" ? baseUrlRaw.trim() : "";
    const base = raw === "" ? defaultBase : raw.replace(/\/+$/, "");
    if (base.endsWith("/models")) {
      return base;
    }
    if (base.endsWith("/v1")) {
      return `${base}/models`;
    }
    return `${base}/v1/models`;
  }

  private async parseErrorMessage(response: Response): Promise<string> {
    const prefix = `HTTP ${response.status}`;
    try {
      const text = await response.text();
      if (text.trim() === "") {
        return prefix;
      }
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      const fromApi = parsed.error?.message;
      if (typeof fromApi === "string" && fromApi.trim() !== "") {
        return `${prefix}: ${fromApi.trim()}`;
      }
      return `${prefix}: ${text.length > 280 ? `${text.slice(0, 280)}…` : text}`;
    } catch {
      return prefix;
    }
  }
}
