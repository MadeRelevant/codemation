import { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";

export { CredentialBindingService, CredentialInstanceService } from "./domain/credentials/CredentialServices";
export { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
export { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";

const defaultOpenAiApiKeyCredentialTypeFactory = new OpenAiApiKeyCredentialTypeFactory(
  new OpenAiApiKeyCredentialHealthTester(globalThis.fetch),
);

export const openAiApiKeyRegisteredCredentialType =
  defaultOpenAiApiKeyCredentialTypeFactory.createRegisteredCredentialType();
