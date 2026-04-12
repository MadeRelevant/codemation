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

export type GmailOutgoingMessageAttachment = Readonly<{
  filename: string;
  mimeType: string;
  body: Uint8Array | string;
  contentId?: string;
  contentTransferEncoding?: "base64" | "quoted-printable" | "7bit" | "8bit" | "binary";
  disposition?: "attachment" | "inline";
}>;

export type GmailSendMessageArgs = Readonly<{
  mailbox?: string;
  to: ReadonlyArray<string>;
  subject: string;
  text?: string;
  html?: string;
  cc?: ReadonlyArray<string>;
  bcc?: ReadonlyArray<string>;
  replyTo?: string;
  from?: string;
  attachments?: ReadonlyArray<GmailOutgoingMessageAttachment>;
  headers?: Readonly<Record<string, string>>;
}>;

export type GmailSendRawMessageArgs = Readonly<{
  mailbox?: string;
  raw: string;
  threadId?: string;
}>;

export type GmailReplyToMessageArgs = Readonly<{
  mailbox?: string;
  messageId: string;
  text?: string;
  html?: string;
  attachments?: ReadonlyArray<GmailOutgoingMessageAttachment>;
  replyToSenderOnly?: boolean;
  headers?: Readonly<Record<string, string>>;
  subject?: string;
}>;

export type GmailModifyLabelsArgs = Readonly<{
  mailbox?: string;
  addLabelIds?: ReadonlyArray<string>;
  removeLabelIds?: ReadonlyArray<string>;
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
  sendMessage(args: GmailSendMessageArgs): Promise<GmailMessageRecord>;
  sendRawMessage(args: GmailSendRawMessageArgs): Promise<GmailMessageRecord>;
  replyToMessage(args: GmailReplyToMessageArgs): Promise<GmailMessageRecord>;
  modifyMessageLabels(
    args: Readonly<{
      mailbox?: string;
      messageId: string;
      addLabelIds?: ReadonlyArray<string>;
      removeLabelIds?: ReadonlyArray<string>;
    }>,
  ): Promise<GmailMessageRecord>;
  modifyThreadLabels(
    args: Readonly<{
      mailbox?: string;
      threadId: string;
      addLabelIds?: ReadonlyArray<string>;
      removeLabelIds?: ReadonlyArray<string>;
    }>,
  ): Promise<void>;
}
