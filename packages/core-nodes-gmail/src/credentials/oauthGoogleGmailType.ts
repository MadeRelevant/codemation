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

// Scopes for the Gmail MCP server
// (https://developers.google.com/workspace/gmail/api/reference/mcp):
// - gmail.readonly  → search_threads, get_thread, list_drafts, list_labels
// - gmail.compose   → create_draft + send
// - gmail.labels    → create_label / label_message / label_thread / unlabel_*
// The MCP server enforces a literal scope-name check, so gmail.modify / gmail.send
// (semantic supersets) get a 403 "The caller does not have permission"; use the
// narrow per-capability scopes above instead.
const GMAIL_DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
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
        envVarName: "GOOGLE_GMAIL_CLIENT_ID",
        helpText:
          "From your Google Cloud OAuth 2.0 Client. Set GOOGLE_GMAIL_CLIENT_ID in your environment to share one app across many credential instances.",
      },
    ],
    secretFields: [
      {
        key: "clientSecret",
        label: "OAuth Client Secret",
        type: "password",
        required: true,
        envVarName: "GOOGLE_GMAIL_CLIENT_SECRET",
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
      const actualScopes = await introspectTokenScopes(material.accessToken);
      const hasReadonly = actualScopes !== undefined && tokenHasReadonlyOrModify(actualScopes);
      if (actualScopes !== undefined && !hasReadonly) {
        return {
          status: "failing",
          message:
            "Token only has metadata-level scope. Disconnect and reconnect to re-authorize with read access (gmail.readonly).",
          testedAt: new Date().toISOString(),
          details: { emailAddress: session.emailAddress, storedScopes: session.scopes, actualScopes },
        };
      }
      return {
        status: "healthy",
        message: "Connected to Gmail successfully.",
        testedAt: new Date().toISOString(),
        details: {
          emailAddress: session.emailAddress,
          storedScopes: session.scopes,
          actualScopes: actualScopes ?? "<tokeninfo unavailable>",
        },
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

async function introspectTokenScopes(accessToken: string): Promise<ReadonlyArray<string> | undefined> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as { scope?: string };
    if (typeof body.scope !== "string" || body.scope.length === 0) return undefined;
    return body.scope.split(/\s+/).filter((s) => s.length > 0);
  } catch {
    return undefined;
  }
}

function tokenHasReadonlyOrModify(scopes: ReadonlyArray<string>): boolean {
  return scopes.some(
    (s) =>
      s === "https://www.googleapis.com/auth/gmail.readonly" ||
      s === "https://www.googleapis.com/auth/gmail.modify" ||
      s === "https://mail.google.com/",
  );
}
