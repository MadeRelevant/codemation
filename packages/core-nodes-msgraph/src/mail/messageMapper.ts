import type { MsGraphMailAddress, MsGraphMailAttachment, MsGraphMailItem } from "./types";

// ---------------------------------------------------------------------------
// Raw Graph API response shapes (minimal — only fields we use)
// ---------------------------------------------------------------------------

export type GraphMessageRaw = Readonly<{
  id: string;
  conversationId?: string;
  receivedDateTime?: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: ReadonlyArray<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: ReadonlyArray<{ emailAddress?: { name?: string; address?: string } }>;
  bccRecipients?: ReadonlyArray<{ emailAddress?: { name?: string; address?: string } }>;
  body?: { content?: string; contentType?: "text" | "html" };
  attachments?: ReadonlyArray<GraphAttachmentRaw>;
  internetMessageHeaders?: ReadonlyArray<{ name?: string; value?: string }>;
}>;

export type GraphAttachmentRaw = Readonly<{
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
}>;

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toAddress(raw: { name?: string; address?: string } | undefined): MsGraphMailAddress {
  return { name: raw?.name, address: raw?.address };
}

function toAddresses(
  list: ReadonlyArray<{ emailAddress?: { name?: string; address?: string } }> | undefined,
): ReadonlyArray<MsGraphMailAddress> {
  return (list ?? []).map((r) => toAddress(r.emailAddress));
}

function toAttachments(list: ReadonlyArray<GraphAttachmentRaw> | undefined): ReadonlyArray<MsGraphMailAttachment> {
  return (list ?? []).map((a) => ({
    id: a.id ?? "",
    name: a.name ?? "",
    contentType: a.contentType ?? "application/octet-stream",
    size: a.size ?? 0,
  }));
}

function toHeaders(
  list: ReadonlyArray<{ name?: string; value?: string }> | undefined,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  for (const h of list ?? []) {
    if (h.name && h.value !== undefined) {
      headers[h.name] = h.value;
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapGraphMessage(raw: GraphMessageRaw): MsGraphMailItem {
  const body = raw.body;
  const isHtml = body?.contentType === "html";

  return {
    messageId: raw.id,
    conversationId: raw.conversationId,
    receivedDateTime: raw.receivedDateTime ?? new Date(0).toISOString(),
    internetMessageId: raw.internetMessageId,
    from: raw.from?.emailAddress ? toAddress(raw.from.emailAddress) : undefined,
    to: toAddresses(raw.toRecipients),
    cc: raw.ccRecipients && raw.ccRecipients.length > 0 ? toAddresses(raw.ccRecipients) : undefined,
    bcc: raw.bccRecipients && raw.bccRecipients.length > 0 ? toAddresses(raw.bccRecipients) : undefined,
    subject: raw.subject,
    bodyText: isHtml ? undefined : body?.content,
    bodyHtml: isHtml ? body?.content : undefined,
    attachments: raw.attachments && raw.attachments.length > 0 ? toAttachments(raw.attachments) : undefined,
    headers: raw.internetMessageHeaders ? toHeaders(raw.internetMessageHeaders) : undefined,
  };
}
