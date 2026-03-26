import type { AnyCredentialType } from "./domain/credentials/CredentialServices";
import { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";

export { CredentialBindingService, CredentialInstanceService } from "./domain/credentials/CredentialServices";
export type {
  AnyCredentialType,
  CredentialSessionFactoryArgs,
  CredentialType,
} from "./domain/credentials/CredentialServices";
export { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
export { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";
export type {
  OpenAiApiKeyMaterial,
  OpenAiApiKeyPublicConfig,
  OpenAiApiKeySession,
} from "./infrastructure/credentials/OpenAiApiKeyCredentialShapes.types";

const defaultOpenAiApiKeyCredentialTypeFactory = new OpenAiApiKeyCredentialTypeFactory(
  new OpenAiApiKeyCredentialHealthTester(globalThis.fetch),
);

export const openAiApiKeyCredentialType: AnyCredentialType =
  defaultOpenAiApiKeyCredentialTypeFactory.createCredentialType();
