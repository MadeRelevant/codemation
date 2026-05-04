import { defineCredential } from "@codemation/core";
import type { CredentialSession, HttpCredentialDelta } from "../http/httpRequest.types";

/**
 * API key credential that injects a key either as an HTTP header or a query parameter.
 */
export const apiKeyCredentialType = defineCredential({
  key: "core-nodes.api-key",
  label: "API Key",
  description: "Authenticates requests by injecting an API key into a header or query parameter.",
  public: {
    placement: {
      label: "Placement",
      type: "string",
      helpText: 'Where to send the key: "header" (default) or "query".',
      placeholder: "header",
    },
    name: {
      label: "Parameter name",
      type: "string",
      helpText: 'Header or query param name. Defaults to "X-API-Key" for headers, "api_key" for query.',
      placeholder: "X-API-Key",
    },
  },
  secret: {
    apiKey: {
      label: "API Key",
      type: "password",
      required: true,
      helpText: "The secret API key value.",
    },
  },
  async createSession(args): Promise<CredentialSession> {
    const apiKey = String(args.material.apiKey ?? "");
    if (!apiKey) {
      throw new Error("API key credential material is incomplete: apiKey is required.");
    }
    const placement = String(args.publicConfig.placement ?? "header").toLowerCase();
    const isQuery = placement === "query";
    const defaultName = isQuery ? "api_key" : "X-API-Key";
    const paramName = String(args.publicConfig.name ?? "").trim() || defaultName;

    return {
      applyToRequest: (_spec): HttpCredentialDelta => {
        if (isQuery) {
          return { query: { [paramName]: apiKey } };
        }
        return { headers: { [paramName]: apiKey } };
      },
    };
  },
  async test(args) {
    const apiKey = String(args.material.apiKey ?? "");
    return {
      status: apiKey.length > 0 ? "healthy" : "failing",
      message: apiKey.length > 0 ? "API key is configured." : "API key is missing.",
      testedAt: new Date().toISOString(),
    };
  },
});
