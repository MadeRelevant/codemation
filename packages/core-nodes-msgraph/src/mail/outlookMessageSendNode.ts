import { defineNode } from "@codemation/core";
import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import { collectGraphAttachments } from "./attachmentHelpers";

// ---------------------------------------------------------------------------
// Shared types (re-exported so workflow DSL can import them from here)
// ---------------------------------------------------------------------------

export type BinaryRef = Readonly<{
  /** The binary slot key on the item (i.e. the key under `item.binary`). */
  slot: string;
  /** Filename to use in the Graph attachment body. */
  name: string;
}>;

export type InlineBinaryRef = Readonly<{
  /** The binary slot key on the item. */
  slot: string;
  /** Filename to use in the Graph attachment body. */
  name: string;
  /** Content-ID value (without angle brackets) matching the `cid:` reference in the HTML body. */
  contentId: string;
}>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGraphRecipients(emails: ReadonlyArray<string>): ReadonlyArray<unknown> {
  return emails.map((address) => ({ emailAddress: { address } }));
}

function buildMessageBody(
  cfg: OutlookMessageSendOptions,
  attachments: ReadonlyArray<unknown>,
): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    subject: cfg.subject,
    body: {
      contentType: cfg.bodyType === "html" ? "html" : "text",
      content: cfg.body,
    },
    toRecipients: toGraphRecipients(cfg.to),
  };

  if (cfg.cc && cfg.cc.length > 0) {
    msg["ccRecipients"] = toGraphRecipients(cfg.cc);
  }
  if (cfg.bcc && cfg.bcc.length > 0) {
    msg["bccRecipients"] = toGraphRecipients(cfg.bcc);
  }
  if (cfg.importance !== undefined) {
    msg["importance"] = cfg.importance;
  }
  if (attachments.length > 0) {
    msg["attachments"] = attachments;
  }

  return msg;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OutlookMessageSendOptions = Readonly<{
  mailbox: string;
  to: ReadonlyArray<string>;
  cc?: ReadonlyArray<string>;
  bcc?: ReadonlyArray<string>;
  subject: string;
  body: string;
  bodyType: "html" | "text";
  attachments?: ReadonlyArray<BinaryRef>;
  inlineAttachments?: ReadonlyArray<InlineBinaryRef>;
  importance?: "low" | "normal" | "high";
  /**
   * When true: POST to `${mailboxPathPrefix}/messages` to create a draft and return its id.
   * When false (default): POST to `${mailboxPathPrefix}/sendMail` and emit `messageId: ""`.
   */
  draftOnly?: boolean;
}>;

export type OutlookMessageSendOutput = Readonly<{
  messageId: string;
  isDraft: boolean;
}>;

// ---------------------------------------------------------------------------
// Pure execute function (exported for testing)
// ---------------------------------------------------------------------------

export async function sendMessage(
  client: ReturnType<typeof createGraphClient>,
  binary: NodeBinaryAttachmentService,
  itemBinary: Record<string, BinaryAttachment>,
  config: OutlookMessageSendOptions,
): Promise<OutlookMessageSendOutput> {
  const prefix = mailboxPathPrefix(config.mailbox);
  const attachments = await collectGraphAttachments(binary, itemBinary, config.attachments, config.inlineAttachments);
  const message = buildMessageBody(config, attachments);

  if (config.draftOnly) {
    const draft = (await withGraphRetry(() => client.api(`${prefix}/messages`).post(message))) as { id?: string };
    return { messageId: draft?.id ?? "", isDraft: true };
  }

  await withGraphRetry(() => client.api(`${prefix}/sendMail`).post({ message, saveToSentItems: true }));
  return { messageId: "", isDraft: false };
}

// ---------------------------------------------------------------------------
// Node definition
// ---------------------------------------------------------------------------

export const outlookMessageSendNode = defineNode({
  key: "msgraph-mail.outlook-message-send",
  title: "Send Outlook message",
  description: "Send or draft a message via Microsoft Graph Outlook, with optional file attachments.",
  icon: "builtin:microsoft-outlook",
  keepBinaries: true,
  credentials: {
    auth: {
      type: msGraphMailOAuthCredentialType,
      label: "Microsoft 365 account",
      helpText: "Bind a Microsoft Graph OAuth credential for the mailbox you want to access.",
    },
  },
  async execute({ item }, { config: rawConfig, credentials, execution }) {
    const session = (await credentials.auth()) as import("../credentials/session").MsGraphSession;
    const client = createGraphClient(session);
    const binary = execution.binary as NodeBinaryAttachmentService;
    const itemBinary = (item.binary ?? {}) as Record<string, BinaryAttachment>;
    const config = rawConfig as unknown as OutlookMessageSendOptions;
    return sendMessage(client, binary, itemBinary, config);
  },
});
