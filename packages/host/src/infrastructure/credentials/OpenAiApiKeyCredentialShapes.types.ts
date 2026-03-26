/**
 * Typed shapes for the `openai.apiKey` credential (public fields, secret material, session object).
 */
export type OpenAiApiKeyPublicConfig = Readonly<{
  baseUrl?: string;
}>;

export type OpenAiApiKeyMaterial = Readonly<{
  apiKey?: string;
}>;

export type OpenAiApiKeySession = Readonly<{
  apiKey: string;
  baseUrl?: string;
}>;
