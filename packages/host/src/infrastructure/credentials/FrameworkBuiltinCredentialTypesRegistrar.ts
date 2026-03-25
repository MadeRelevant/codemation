import type { CodemationApplication } from "../../codemationApplication";
import type { CodemationConfig } from "../../presentation/config/CodemationConfig";

import { openAiApiKeyRegisteredCredentialType } from "./openAiApiKeyCredentialType";

/**
 * Registers framework-owned credential types that ship with the host (OpenAI-compatible API keys, etc.).
 */
export class FrameworkBuiltinCredentialTypesRegistrar {
  register(application: CodemationApplication, config?: CodemationConfig): void {
    const openAiProvidedInConsumerConfig =
      config?.credentialTypes?.some(
        (entry) => entry.definition.typeId === openAiApiKeyRegisteredCredentialType.definition.typeId,
      ) ?? false;
    if (!openAiProvidedInConsumerConfig) {
      application.registerCredentialType(openAiApiKeyRegisteredCredentialType);
    }
  }
}
