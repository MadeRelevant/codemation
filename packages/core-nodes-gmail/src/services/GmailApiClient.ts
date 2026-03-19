import type { GmailPulledNotification } from "./GmailPubSubPullClient";

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
  ensureSubscription(args: Readonly<{
    topicName: string;
    subscriptionName: string;
  }>): Promise<void>;
  pull(args: Readonly<{
    subscriptionName: string;
    maxMessages?: number;
  }>): Promise<ReadonlyArray<GmailPulledNotification>>;
  getCurrentHistoryId(args: Readonly<{ mailbox: string }>): Promise<string>;
  listMessageIds(args: Readonly<{
    mailbox: string;
    labelIds?: ReadonlyArray<string>;
    query?: string;
    maxResults?: number;
  }>): Promise<ReadonlyArray<string>>;
  listLabels(args: Readonly<{ mailbox: string }>): Promise<ReadonlyArray<GmailLabelRecord>>;
  watchMailbox(args: Readonly<{
    mailbox: string;
    topicName: string;
    labelIds?: ReadonlyArray<string>;
  }>): Promise<GmailWatchRegistration>;
  listAddedMessageIds(args: Readonly<{
    mailbox: string;
    startHistoryId: string;
  }>): Promise<GmailHistoryDelta>;
  getMessage(args: Readonly<{
    mailbox: string;
    messageId: string;
  }>): Promise<GmailMessageRecord>;
  getAttachmentContent(args: Readonly<{
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
