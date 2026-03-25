import type { CodemationApplication } from "../../codemationApplication";
import type { CodemationConfig } from "../../presentation/config/CodemationConfig";

import type { OpenAiApiKeyCredentialTypeFactory } from "./OpenAiApiKeyCredentialTypeFactory";

/**
 * Registers framework-owned credential types that ship with the host (OpenAI-compatible API keys, etc.).
 */
export class FrameworkBuiltinCredentialTypesRegistrar {
  constructor(private readonly openAiApiKeyCredentialTypeFactory: OpenAiApiKeyCredentialTypeFactory) {}

  register(application: CodemationApplication, config?: CodemationConfig): void {
    const openAiRegistered = this.openAiApiKeyCredentialTypeFactory.createRegisteredCredentialType();
    const openAiProvidedInConsumerConfig =
      config?.credentialTypes?.some((entry) => entry.definition.typeId === openAiRegistered.definition.typeId) ?? false;
    if (!openAiProvidedInConsumerConfig) {
      application.registerCredentialType(openAiRegistered);
    }
  }
}
