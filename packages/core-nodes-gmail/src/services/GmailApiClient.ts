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
  attachments: ReadonlyArray<GmailMessageAttachmentRecord>;
}>;

export type GmailLabelRecord = Readonly<{
  id: string;
  name: string;
  type?: string;
}>;

export type GmailMessageAttachmentRecord = Readonly<{
  attachmentId: string;
  filename?: string;
  mimeType: string;
  size?: number;
  binaryName: string;
}>;

export type GmailMessageAttachmentContent = Readonly<{
  attachmentId: string;
  body: Uint8Array;
  mimeType: string;
  filename?: string;
  size?: number;
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
  listMessageIds(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    labelIds?: ReadonlyArray<string>;
    query?: string;
    maxResults?: number;
  }>): Promise<ReadonlyArray<string>>;
  listLabels(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
  }>): Promise<ReadonlyArray<GmailLabelRecord>>;
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
  getAttachmentContent(args: Readonly<{
    credential: CredentialInput<GmailServiceAccountCredential>;
    mailbox: string;
    messageId: string;
    attachment: GmailMessageAttachmentRecord;
  }>): Promise<GmailMessageAttachmentContent>;
}

export class GmailHistoryGapError extends Error {
  constructor(message = "The stored Gmail history cursor is no longer available and must be re-baselined.") {
    super(message);
    this.name = "GmailHistoryGapError";
  }
}
