export type GmailMessageRecord = Readonly<{
  messageId: string;
  threadId?: string;
  historyId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds: ReadonlyArray<string>;
  headers: Readonly<Record<string, string>>;
  /** Inline `text/plain` body from the message payload (when returned with `format: full`). */
  textPlain?: string;
  /** Inline `text/html` body from the message payload (when returned with `format: full`). */
  textHtml?: string;
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

export interface GmailApiClient {
  getCurrentHistoryId(args: Readonly<{ mailbox: string }>): Promise<string>;
  listMessageIds(
    args: Readonly<{
      mailbox: string;
      labelIds?: ReadonlyArray<string>;
      query?: string;
      maxResults?: number;
    }>,
  ): Promise<ReadonlyArray<string>>;
  listLabels(args: Readonly<{ mailbox: string }>): Promise<ReadonlyArray<GmailLabelRecord>>;
  getMessage(
    args: Readonly<{
      mailbox: string;
      messageId: string;
    }>,
  ): Promise<GmailMessageRecord>;
  getAttachmentContent(
    args: Readonly<{
      mailbox: string;
      messageId: string;
      attachment: GmailMessageAttachmentRecord;
    }>,
  ): Promise<GmailMessageAttachmentContent>;
}
