import type { CredentialType } from "@codemation/core";
import { GoogleGmailSessionFactory } from "../adapters/google/GoogleGmailSessionFactory";
import type { GmailSession } from "../contracts/GmailSession";

export type OAuthGoogleGmailPublicConfig = Readonly<{
  clientId: string;
}>;

export type OAuthGoogleGmailMaterial = Readonly<{
  clientSecret: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  grantedScopes: string[];
}>;

const GMAIL_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://www.googleapis.com/auth/gmail.settings.sharing",
] as const;

export const oauthGoogleGmailType: CredentialType<
  OAuthGoogleGmailPublicConfig,
  OAuthGoogleGmailMaterial,
  GmailSession
> = {
  definition: {
    typeId: "oauth.google.gmail",
    displayName: "Gmail (OAuth)",
    description:
      "Google OAuth credential covering Gmail — use one instance for Gmail trigger nodes and the Gmail MCP server.",
    publicFields: [
      {
        key: "clientId",
        label: "OAuth Client ID",
        type: "string",
        required: true,
        envVarName: "GOOGLE_CLIENT_ID",
        helpText:
          "From your Google Cloud OAuth 2.0 Client. Set GOOGLE_CLIENT_ID in your environment to share one app across many credential instances.",
      },
    ],
    secretFields: [
      {
        key: "clientSecret",
        label: "OAuth Client Secret",
        type: "password",
        required: true,
        envVarName: "GOOGLE_CLIENT_SECRET",
      },
    ],
    supportedSourceKinds: ["db", "env", "code"] as const,
    auth: {
      kind: "oauth2",
      providerId: "google",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: GMAIL_DEFAULT_SCOPES,
      clientIdFieldKey: "clientId",
      clientSecretFieldKey: "clientSecret",
    },
  },
  async createSession(args) {
    const { publicConfig, material } = args;
    if (!publicConfig.clientId || !material.clientSecret || !material.accessToken) {
      throw new Error("Gmail OAuth credential is incomplete — clientId, clientSecret, and accessToken are required.");
    }
    return await new GoogleGmailSessionFactory().createSession({
      clientId: publicConfig.clientId,
      clientSecret: material.clientSecret,
      accessToken: material.accessToken,
      refreshToken: material.refreshToken,
      expiry: material.expiresAt,
      scopes: material.grantedScopes.length > 0 ? material.grantedScopes : [...GMAIL_DEFAULT_SCOPES],
    });
  },
  async test(args) {
    const { publicConfig, material } = args;
    if (!publicConfig.clientId || !material.clientSecret || !material.accessToken) {
      return {
        status: "failing",
        message: "Gmail OAuth credential is incomplete — connect via the credential dialog.",
        testedAt: new Date().toISOString(),
      };
    }
    try {
      const session = await new GoogleGmailSessionFactory().createSession({
        clientId: publicConfig.clientId,
        clientSecret: material.clientSecret,
        accessToken: material.accessToken,
        refreshToken: material.refreshToken,
        expiry: material.expiresAt,
        scopes: material.grantedScopes.length > 0 ? material.grantedScopes : [...GMAIL_DEFAULT_SCOPES],
      });
      await session.client.users.getProfile({ userId: session.userId });
      return {
        status: "healthy",
        message: "Connected to Gmail successfully.",
        testedAt: new Date().toISOString(),
        details: { emailAddress: session.emailAddress, scopes: session.scopes },
      };
    } catch (error) {
      return {
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
        testedAt: new Date().toISOString(),
      };
    }
  },
};
