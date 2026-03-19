export type GmailOAuthCredential = Readonly<{
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  expiry?: string;
}>;
