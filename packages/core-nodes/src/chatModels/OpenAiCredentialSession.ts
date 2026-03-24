/** Resolved credential session for OpenAI-compatible chat models (API key + optional custom base URL). */
export type OpenAiCredentialSession = Readonly<{
  apiKey: string;
  baseUrl?: string;
}>;
