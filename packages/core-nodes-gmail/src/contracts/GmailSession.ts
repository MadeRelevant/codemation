import { google, type gmail_v1 } from "googleapis";

export type GmailSession = Readonly<{
  auth: InstanceType<typeof google.auth.OAuth2>;
  client: gmail_v1.Gmail;
  userId: "me";
  emailAddress?: string;
  scopes: ReadonlyArray<string>;
}>;
