import type { CredentialType } from "../../domain/credentials/CredentialServices";

import type { OpenAiApiKeyCredentialHealthTester } from "./OpenAiApiKeyCredentialHealthTester";
import type {
  OpenAiApiKeyMaterial,
  OpenAiApiKeyPublicConfig,
  OpenAiApiKeySession,
} from "./OpenAiApiKeyCredentialShapes.types";

/**
 * Builds the OpenAI-compatible API key credential (`openai.apiKey`) registration.
 * Used by {@link FrameworkBuiltinCredentialTypesRegistrar} and may be listed in {@link CodemationConfig.credentialTypes}
 * so consumer apps always register the type even when bootstrap order differs.
 */
export class OpenAiApiKeyCredentialTypeFactory {
  constructor(private readonly healthTester: OpenAiApiKeyCredentialHealthTester) {}

  createCredentialType(): CredentialType<OpenAiApiKeyPublicConfig, OpenAiApiKeyMaterial, OpenAiApiKeySession> {
    return {
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
        const baseUrl = typeof baseUrlRaw === "string" && baseUrlRaw.trim() !== "" ? baseUrlRaw.trim() : undefined;
        return {
          apiKey: String(args.material.apiKey ?? ""),
          baseUrl,
        };
      },
      test: async (args) => this.healthTester.test(args),
    };
  }
}
