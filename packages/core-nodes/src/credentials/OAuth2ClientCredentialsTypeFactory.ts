import { defineCredential } from "@codemation/core";
import type { CredentialSession, HttpCredentialDelta } from "../http/httpRequest.types";
import { OAuth2TokenExchangeFactory } from "./OAuth2TokenExchangeFactory";

/**
 * OAuth2 client-credentials flow credential.
 *
 * This is a machine-to-machine flow: no user redirect occurs. The session
 * POSTs to the configured `tokenUrl` with `client_credentials` grant, caches
 * the resulting access token for the duration of the session, and injects it
 * as `Authorization: Bearer <token>` on each request.
 *
 * Token caching is per-session only (one createSession call = one token fetch
 * at most). Cross-session caching would require host-level state and is out of
 * scope here. Because the engine creates a fresh session per execution, a new
 * token is fetched once per node activation.
 *
 * NOTE: `auth` is intentionally omitted from the definition. The OAuth2
 * `auth: { kind: "oauth2" }` shape signals an authorization-code / user-redirect
 * flow; using it here would cause the host UI to render an OAuth consent button
 * that goes nowhere. Client-credentials is a purely server-side flow.
 */
export const oauth2ClientCredentialsType = defineCredential({
  key: "core-nodes.oauth2-client-credentials",
  label: "OAuth2 Client Credentials",
  description:
    "Machine-to-machine OAuth2 using the client_credentials grant. Exchanges client ID and secret for a bearer token before each workflow execution.",
  public: {
    tokenUrl: {
      label: "Token URL",
      type: "string",
      required: true,
      helpText: "The token endpoint URL, e.g. https://auth.example.com/oauth/token.",
    },
    scopes: {
      label: "Scopes",
      type: "string",
      helpText: "Space-separated list of OAuth2 scopes to request (optional).",
    },
    audience: {
      label: "Audience",
      type: "string",
      helpText: "Optional audience parameter sent to the token endpoint.",
      visibility: "advanced",
    },
  },
  secret: {
    clientId: {
      label: "Client ID",
      type: "string",
      required: true,
    },
    clientSecret: {
      label: "Client Secret",
      type: "password",
      required: true,
    },
  },
  async createSession(args): Promise<CredentialSession> {
    const tokenUrl = String(args.publicConfig.tokenUrl ?? "");
    const clientId = String(args.material.clientId ?? "");
    const clientSecret = String(args.material.clientSecret ?? "");

    if (!tokenUrl || !clientId || !clientSecret) {
      throw new Error(
        "OAuth2 client credentials are incomplete: tokenUrl, clientId, and clientSecret are required.",
      );
    }

    // Fetch the token eagerly so any failure surfaces at session creation time.
    const accessToken = await new OAuth2TokenExchangeFactory().create({
      tokenUrl,
      clientId,
      clientSecret,
      scopes: String(args.publicConfig.scopes ?? ""),
      audience: String(args.publicConfig.audience ?? ""),
    });

    return {
      applyToRequest: (_spec): HttpCredentialDelta => ({
        headers: { authorization: `Bearer ${accessToken}` },
      }),
    };
  },
  async test(args) {
    const tokenUrl = String(args.publicConfig.tokenUrl ?? "");
    const clientId = String(args.material.clientId ?? "");
    const clientSecret = String(args.material.clientSecret ?? "");

    if (!tokenUrl || !clientId || !clientSecret) {
      return {
        status: "failing",
        message: "tokenUrl, clientId, and clientSecret are all required.",
        testedAt: new Date().toISOString(),
      };
    }

    try {
      await new OAuth2TokenExchangeFactory().create({
        tokenUrl,
        clientId,
        clientSecret,
        scopes: String(args.publicConfig.scopes ?? ""),
        audience: String(args.publicConfig.audience ?? ""),
      });
      return {
        status: "healthy",
        message: "Token exchange succeeded.",
        testedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "failing",
        message: error instanceof Error ? error.message : String(error),
        testedAt: new Date().toISOString(),
      };
    }
  },
});

