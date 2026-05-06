export type MsGraphMailAddress = Readonly<{
  name?: string;
  address?: string;
}>;

/**
 * Attachment metadata only — never carries the raw payload (`contentBytes`) on the workflow item
 * to avoid bloating run state in the database. Set the trigger's `downloadAttachments: true` and
 * the execute() step registers the actual bytes via `ctx.binary.attach(...)`, which puts them in
 * the framework's binary storage; consumers read the bytes on demand through `item.binary[name]`.
 *
 * Inline attachments (e.g. embedded images in HTML email) carry `isInline: true` and a `contentId`
 * matching the CID reference in the HTML body. Their binary slot is named `"inline:{contentId}"`.
 */
export type MsGraphMailAttachment = Readonly<{
  id: string;
  name: string;
  contentType: string;
  size: number;
  /** True when the attachment is an inline part (e.g. an embedded image referenced by CID). */
  isInline?: boolean;
  /** The Content-ID value for inline attachments, stripped of angle-bracket wrapping. */
  contentId?: string;
}>;

/** An attachment that was skipped during binary fetch (e.g. exceeded the size cap). */
export type MsGraphMailSkippedAttachment = Readonly<{
  name: string;
  size: number;
  reason: "size-cap";
}>;

export type MsGraphMailItem = Readonly<{
  messageId: string;
  conversationId?: string;
  receivedDateTime: string;
  internetMessageId?: string;
  /** Message-ID of the email this message is replying to, from the `In-Reply-To` header. */
  replyToMessageId?: string;
  from?: MsGraphMailAddress;
  to: ReadonlyArray<MsGraphMailAddress>;
  cc?: ReadonlyArray<MsGraphMailAddress>;
  bcc?: ReadonlyArray<MsGraphMailAddress>;
  subject?: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments?: ReadonlyArray<MsGraphMailAttachment>;
  headers?: Readonly<Record<string, string>>;
  /**
   * Attachments that were skipped during binary fetch because they exceeded the configured
   * `attachmentSizeCapBytes`. Present only when at least one attachment was skipped.
   */
  skippedAttachments?: ReadonlyArray<MsGraphMailSkippedAttachment>;
}>;

export type MsGraphMailTriggerState = Readonly<{
  mailbox: string;
  folderId: string;
  processedMessageIds: ReadonlyArray<string>;
  baselineComplete: boolean;
}>;
