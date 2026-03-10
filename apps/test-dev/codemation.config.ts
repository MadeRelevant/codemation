import { CodemationConfigFactory } from "@codemation/application";
import { InMemoryCredentialService, credentialId } from "@codemation/core";

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");

const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  return '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';
});

export default CodemationConfigFactory.define({
  credentials,
});
