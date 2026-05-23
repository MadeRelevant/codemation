import { ContentUnderstandingClient } from "@azure/ai-content-understanding";
import { AzureKeyCredential } from "@azure/core-auth";
import { defineCredential } from "@codemation/core";

export type AzureContentUnderstandingSession = Readonly<{
  endpoint: string;
  apiKey: string;
}>;

function normalizeEndpoint(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function buildSession(args: {
  readonly publicConfig: Readonly<Record<string, unknown>>;
  readonly material: Readonly<Record<string, unknown>>;
}): AzureContentUnderstandingSession {
  const endpoint = normalizeEndpoint(String(args.publicConfig["endpoint"] ?? ""));
  const apiKey = String(args.material["apiKey"] ?? "").trim();
  if (!endpoint) {
    throw new Error("Azure Content Understanding credential is incomplete: endpoint is required.");
  }
  if (!apiKey) {
    throw new Error("Azure Content Understanding credential is incomplete: API key is required.");
  }
  return { endpoint, apiKey };
}

export const azureContentUnderstandingCredentialType = defineCredential({
  key: "azure.contentUnderstanding",
  label: "Azure Content Understanding",
  description: "Azure AI Content Understanding (endpoint + key) for prebuilt document, invoice, and image analyzers.",
  public: {
    endpoint: {
      key: "endpoint",
      label: "Endpoint",
      type: "string" as const,
      required: true,
      placeholder: "https://your-resource.cognitiveservices.azure.com/",
      helpText: "Content Understanding resource endpoint URL (no trailing slash).",
      order: 0,
    },
  },
  secret: {
    apiKey: {
      key: "apiKey",
      label: "API key",
      type: "password" as const,
      required: true,
      order: 1,
    },
  },
  async createSession(args) {
    return buildSession(args);
  },
  async test(args) {
    try {
      const session = buildSession(args);
      const client = new ContentUnderstandingClient(session.endpoint, new AzureKeyCredential(session.apiKey));
      const iter = client.listAnalyzers();
      await iter.next();
      return {
        status: "healthy",
        message: "Listed analyzers successfully.",
        testedAt: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: "failing",
        message: message || "Azure Content Understanding connection failed.",
        testedAt: new Date().toISOString(),
      };
    }
  },
});
