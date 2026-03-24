import type { RegisteredCredentialType } from "../../domain/credentials/CredentialServices";

/**
 * OpenAI-compatible API key credential (`openai.apiKey`).
 * Used by {@link FrameworkBuiltinCredentialTypesRegistrar} and may be listed in {@link CodemationConfig.credentialTypes}
 * so consumer apps always register the type even when bootstrap order differs.
 */
export const openAiApiKeyRegisteredCredentialType: RegisteredCredentialType = {
  definition: {
    typeId: "openai.apiKey",
    displayName: "OpenAI API key",
    description: "API key and optional base URL for OpenAI or OpenAI-compatible chat endpoints.",
    publicFields: [
      {
        key: "baseUrl",
        label: "Base URL",
        type: "string",
        placeholder: "https://api.openai.com/v1",
        helpText: "Leave empty to use the default OpenAI API endpoint.",
      },
    ],
    secretFields: [{ key: "apiKey", label: "API key", type: "password", required: true }],
    supportedSourceKinds: ["db", "env", "code"],
  },
  createSession: async (args) => {
    const baseUrlRaw = args.publicConfig.baseUrl;
    const baseUrl =
      typeof baseUrlRaw === "string" && baseUrlRaw.trim() !== "" ? baseUrlRaw.trim() : undefined;
    return {
      apiKey: String(args.material.apiKey ?? ""),
      baseUrl,
    };
  },
  test: async (args) => {
    const apiKey = String(args.material.apiKey ?? "").trim();
    return apiKey.length > 0
      ? {
          status: "healthy",
          message: "Resolved OpenAI API key successfully.",
          testedAt: new Date().toISOString(),
        }
      : {
          status: "failing",
          message: "OpenAI API key is empty.",
          testedAt: new Date().toISOString(),
        };
  },
};
