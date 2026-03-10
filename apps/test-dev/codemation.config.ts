import { CodemationConfigFactory } from "@codemation/application";
import { InMemoryCredentialService, credentialId } from "@codemation/core";

const OPENAI_API_KEY = credentialId<string>("openai.apiKey");

const credentials = new InMemoryCredentialService().setFactory(OPENAI_API_KEY, () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing env var: OPENAI_API_KEY");
  return apiKey;
});

export default CodemationConfigFactory.define({
  credentials,
});
