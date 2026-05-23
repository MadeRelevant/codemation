import type { Auth, gmail_v1 } from "googleapis";

export type GmailSession = Readonly<{
  auth: Auth.OAuth2Client;
  client: gmail_v1.Gmail;
  userId: "me";
  emailAddress?: string;
  scopes: ReadonlyArray<string>;
}>;
