import type { CredentialType } from "@codemation/core";

type ExampleApiKeyPublicConfig = Readonly<Record<string, never>>;

type ExampleApiKeyMaterial = Readonly<{
  apiKey?: string;
}>;

type ExampleApiKeySession = Readonly<{
  apiKey: string;
}>;

export const exampleApiKeyCredentialType: CredentialType<
  ExampleApiKeyPublicConfig,
  ExampleApiKeyMaterial,
  ExampleApiKeySession
> = {
  definition: {
    typeId: "example.api-key",
    displayName: "Example API key",
    description: "Sample credential type for a scaffolded Codemation plugin.",
    secretFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    supportedSourceKinds: ["db", "env", "code"],
  },
  createSession: async (args) => {
    const apiKey = String(args.material.apiKey ?? "");
    if (apiKey.length === 0) {
      throw new Error("Example API key material is incomplete.");
    }
    return { apiKey };
  },
  test: async (args) => {
    const apiKey = String(args.material.apiKey ?? "");
    return {
      status: apiKey.length > 0 ? "healthy" : "failing",
      message: apiKey.length > 0 ? "Credential is configured." : "API key is missing.",
      testedAt: new Date().toISOString(),
    };
  },
};
