import type { CredentialType } from "@codemation/core";

type PluginDevApiKeyPublicConfig = Readonly<Record<string, never>>;

type PluginDevApiKeyMaterial = Readonly<{
  apiKey?: string;
}>;

type PluginDevApiKeySession = Readonly<{
  apiKey: string;
}>;

export const pluginDevApiKeyCredentialType: CredentialType<
  PluginDevApiKeyPublicConfig,
  PluginDevApiKeyMaterial,
  PluginDevApiKeySession
> = {
  definition: {
    typeId: "plugin-dev.api-key",
    displayName: "Plugin dev API key",
    description: "Minimal credential used by the in-repo plugin development sandbox.",
    secretFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    supportedSourceKinds: ["db", "env", "code"],
  },
  createSession: async (args) => {
    const apiKey = String(args.material.apiKey ?? "");
    if (apiKey.length === 0) {
      throw new Error("Plugin dev API key material is incomplete.");
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
