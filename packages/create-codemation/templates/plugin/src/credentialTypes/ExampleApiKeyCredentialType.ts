import { defineCredential } from "@codemation/core";

export const exampleApiKeyCredentialType = defineCredential({
  key: "example.api-key",
  label: "Example API key",
  description: "Sample credential type for a scaffolded Codemation plugin.",
  public: {},
  secret: {
    apiKey: "password",
  },
  async createSession(args) {
    const apiKey = String(args.material.apiKey ?? "");
    if (apiKey.length === 0) {
      throw new Error("Example API key material is incomplete.");
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
