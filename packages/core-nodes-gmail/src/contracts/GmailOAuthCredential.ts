export type GmailOAuthScopePreset = "automation" | "readonly" | "custom";

export type GmailOAuthPublicConfig = Readonly<{
  clientId?: string;
  scopePreset?: string;
  customScopes?: string;
}>;

export type GmailOAuthMaterial = Readonly<{
  clientSecret?: string;
  access_token?: string;
  refresh_token?: string;
  expiry?: string;
  scope?: string;
}>;

export type GmailOAuthCredential = Readonly<{
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  expiry?: string;
  scopes: ReadonlyArray<string>;
}>;
