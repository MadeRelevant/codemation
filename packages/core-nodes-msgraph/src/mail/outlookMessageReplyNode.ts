import { defineNode } from "@codemation/core";
import type { BinaryAttachment, NodeBinaryAttachmentService } from "@codemation/core";
import { msGraphMailOAuthCredentialType } from "../credentials/msGraphMailOAuth";
import { createGraphClient } from "../credentials/session";
import type { Recipient } from "../lib/filterMailRecipients";
import { mailboxPathPrefix } from "../lib/graphPaths";
import { withGraphRetry } from "../lib/graphRetry";
import { collectGraphAttachments } from "./attachmentHelpers";
import type { BinaryRef, InlineBinaryRef } from "./outlookMessageSendNode";

export type { BinaryRef, InlineBinaryRef };

export type OutlookMessageReplyOptions = Readonly<{
  mailbox: string;
  messageId: string;
  body: string;
  bodyType: "html" | "text";
  forward?: boolean;
  replyAll?: boolean;
  to?: ReadonlyArray<string>;
  cc?: ReadonlyArray<string>;
  bcc?: ReadonlyArray<string>;
  attachments?: ReadonlyArray<BinaryRef>;
  inlineAttachments?: ReadonlyArray<InlineBinaryRef>;
  filterRecipients?: (recipients: ReadonlyArray<Recipient>) => ReadonlyArray<Recipient>;
  importance?: "low" | "normal" | "high";
  draftOnly?: boolean;
  includeOriginal?: boolean;
}>;

export type OutlookMessageReplyOutput = Readonly<{
  messageId: string;
  isDraft: boolean;
}>;

function toGraphRecipients(emails: ReadonlyArray<string>): ReadonlyArray<Recipient> {
  return emails.map((address) => ({ emailAddress: { address } }));
}

// ---------------------------------------------------------------------------
// Pure execute function (exported for testing)
// ---------------------------------------------------------------------------

export async function replyToMessage(
  client: ReturnType<typeof createGraphClient>,
  binary: NodeBinaryAttachmentService,
  itemBinary: Record<string, BinaryAttachment>,
  config: OutlookMessageReplyOptions,
): Promise<OutlookMessageReplyOutput> {
  const prefix = mailboxPathPrefix(config.mailbox);
  const msgId = encodeURIComponent(config.messageId);

  if (config.forward && (!config.to || config.to.length === 0)) {
    throw new Error("OutlookMessageReplyNode: forward: true requires at least one recipient in `to`.");
  }

  let createEndpoint: string;
  if (config.forward) {
    createEndpoint = `${prefix}/messages/${msgId}/createForward`;
  } else if (config.replyAll) {
    createEndpoint = `${prefix}/messages/${msgId}/createReplyAll`;
  } else {
    createEndpoint = `${prefix}/messages/${msgId}/createReply`;
  }

  const draft = (await withGraphRetry(() => client.api(createEndpoint).post(undefined))) as { id?: string };
  const draftId = draft?.id;
  if (!draftId) {
    throw new Error("OutlookMessageReplyNode: createReply/createReplyAll/createForward returned no draft id.");
  }

  const patchBody: Record<string, unknown> = {
    body: { contentType: config.bodyType === "html" ? "html" : "text", content: config.body },
  };

  const applyFilter = config.filterRecipients ?? ((rs: ReadonlyArray<Recipient>) => rs);
  if (config.to !== undefined) patchBody["toRecipients"] = applyFilter(toGraphRecipients(config.to));
  if (config.cc !== undefined) patchBody["ccRecipients"] = applyFilter(toGraphRecipients(config.cc));
  if (config.bcc !== undefined) patchBody["bccRecipients"] = applyFilter(toGraphRecipients(config.bcc));
  if (config.importance !== undefined) patchBody["importance"] = config.importance;

  await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}`).patch(patchBody));

  const attachmentObjects = await collectGraphAttachments(
    binary,
    itemBinary,
    config.attachments,
    config.inlineAttachments,
  );
  for (const att of attachmentObjects) {
    await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}/attachments`).post(att));
  }

  if (!config.draftOnly) {
    await withGraphRetry(() => client.api(`${prefix}/messages/${encodeURIComponent(draftId)}/send`).post(undefined));
  }

  return { messageId: draftId, isDraft: config.draftOnly ?? false };
}

export const outlookMessageReplyNode = defineNode({
  key: "msgraph-mail.outlook-message-reply",
  title: "Reply to Outlook message",
  description: "Reply, reply-all, or forward a message via Microsoft Graph Outlook.",
  icon: "builtin:microsoft-outlook",
  keepBinaries: true,
  inspectorSummary({ config }) {
    const cfg = config as unknown as OutlookMessageReplyOptions;
    const rows = [
      { label: "Mailbox", value: String(cfg.mailbox ?? "me") },
      { label: "Body type", value: cfg.bodyType ?? "text" },
    ];
    if (cfg.forward) rows.push({ label: "Action", value: "forward" });
    else if (cfg.replyAll) rows.push({ label: "Action", value: "reply-all" });
    else rows.push({ label: "Action", value: "reply" });
    if (cfg.draftOnly) rows.push({ label: "Draft only", value: "yes" });
    return rows;
  },
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
    const config = rawConfig as unknown as OutlookMessageReplyOptions;
    return replyToMessage(client, binary, itemBinary, config);
  },
});
