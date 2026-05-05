export type MsGraphMailAddress = Readonly<{
  name?: string;
  address?: string;
}>;

/**
 * Attachment metadata only — never carries the raw payload (`contentBytes`) on the workflow item
 * to avoid bloating run state in the database. Set the trigger's `downloadAttachments: true` and
 * the execute() step registers the actual bytes via `ctx.binary.attach(...)`, which puts them in
 * the framework's binary storage; consumers read the bytes on demand through `item.binary[name]`.
 */
export type MsGraphMailAttachment = Readonly<{
  id: string;
  name: string;
  contentType: string;
  size: number;
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
