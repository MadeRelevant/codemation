import type { CredentialInput } from "@codemation/core";
import type { GmailServiceAccountCredential } from "../contracts/GmailServiceAccountCredential";

export type GmailMessageRecord = Readonly<{
  messageId: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds: ReadonlyArray<string>;
  headers: Readonly<Record<string, string>>;
}>;

export type GmailHistoryDelta = Readonly<{
  historyId: string;
  messageIds: ReadonlyArray<string>;
}>;

export type GmailWatchRegistration = Readonly<{
  historyId: string;
  expirationAt: string;
}>;

export interface GmailApiClient {
  getCurrentHistoryId(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
  }>): Promise<string>;
  watchMailbox(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    topicName: string;
    labelIds?: ReadonlyArray<string>;
  }>): Promise<GmailWatchRegistration>;
  listAddedMessageIds(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    startHistoryId: string;
  }>): Promise<GmailHistoryDelta>;
  getMessage(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    messageId: string;
  }>): Promise<GmailMessageRecord>;
}

export class GmailHistoryGapError extends Error {
  constructor(message = "The stored Gmail history cursor is no longer available and must be re-baselined.") {
    super(message);
    this.name = "GmailHistoryGapError";
  }
}
