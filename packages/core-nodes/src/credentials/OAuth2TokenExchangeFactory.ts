/**
 * Performs an OAuth2 `client_credentials` token exchange against a token endpoint
 * and returns the resulting access token.
 *
 * Lives in a Factory file so the body URLSearchParams construction is allowed at
 * the composition root.
 */
export type OAuth2ClientCredentialsArgs = Readonly<{
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  audience: string;
}>;

export class OAuth2TokenExchangeFactory {
  async create(args: OAuth2ClientCredentialsArgs): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: args.clientId,
    });
    if (args.scopes) {
      body.set("scope", args.scopes);
    }
    if (args.audience) {
      body.set("audience", args.audience);
    }

    const encoded = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64");

    const response = await globalThis.fetch(args.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${encoded}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Token exchange failed (${response.status} ${response.statusText}): ${text}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const token = String(json["access_token"] ?? "");
    if (!token) {
      throw new Error("Token exchange response did not include an access_token.");
    }
    return token;
  }
}
