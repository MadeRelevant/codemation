import { defineCredential } from "@codemation/core";

export const pluginDevApiKeyCredentialType = defineCredential({
  key: "plugin-dev.api-key",
  label: "Plugin dev API key",
  description: "Minimal credential used by the in-repo plugin development sandbox.",
  public: {},
  secret: {
    apiKey: "password",
  },
  async createSession(args) {
    const apiKey = String(args.material.apiKey ?? "");
    if (apiKey.length === 0) {
      throw new Error("Plugin dev API key material is incomplete.");
    }
    return { apiKey };
  },
  async test(args) {
    const apiKey = String(args.material.apiKey ?? "");
    return {
      status: apiKey.length > 0 ? "healthy" : "failing",
      message: apiKey.length > 0 ? "Credential is configured." : "API key is missing.",
      testedAt: new Date().toISOString(),
    };
  },
});
