export type MsGraphMailAddress = Readonly<{
  name?: string;
  address?: string;
}>;

export type MsGraphMailAttachment = Readonly<{
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
}>;

export type MsGraphMailItem = Readonly<{
  messageId: string;
  conversationId?: string;
  receivedDateTime: string;
  internetMessageId?: string;
  from?: MsGraphMailAddress;
  to: ReadonlyArray<MsGraphMailAddress>;
  cc?: ReadonlyArray<MsGraphMailAddress>;
  bcc?: ReadonlyArray<MsGraphMailAddress>;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: ReadonlyArray<MsGraphMailAttachment>;
  headers?: Readonly<Record<string, string>>;
}>;

export type MsGraphMailTriggerState = Readonly<{
  mailbox: string;
  folderId: string;
  processedMessageIds: ReadonlyArray<string>;
  baselineComplete: boolean;
}>;
