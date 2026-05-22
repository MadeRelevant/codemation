import type { gmail_v1 } from "googleapis";
import type { GmailOAuthCredential } from "../../contracts/GmailOAuthCredential";
import type { GmailSession } from "../../contracts/GmailSession";

export class GoogleGmailSessionFactory {
  async createSession(credential: GmailOAuthCredential): Promise<GmailSession> {
    // Lazy import: pulling `googleapis` at module top-level parses ~100 API client
    // classes and adds ~1 minute to cold-start of `pnpm dev` (the consumer config
    // loader imports plugins transitively). Defer until a session is actually built.
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2(credential.clientId, credential.clientSecret);
    auth.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
      expiry_date: credential.expiry ? new Date(credential.expiry).getTime() : undefined,
    });
    const client = google.gmail({
      version: "v1",
      auth,
    });
    return {
      auth,
      client,
      userId: "me",
      emailAddress: await this.resolveEmailAddress(client),
      scopes: credential.scopes,
    };
  }

  private async resolveEmailAddress(client: gmail_v1.Gmail): Promise<string | undefined> {
    try {
      const response = await client.users.getProfile({ userId: "me" });
      return response.data.emailAddress ?? undefined;
    } catch {
      return undefined;
    }
  }
}
