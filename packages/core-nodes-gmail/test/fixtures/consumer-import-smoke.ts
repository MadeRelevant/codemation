import { itemExpr, type Item } from "@codemation/core";
import {
  GmailAttachmentMapping,
  ModifyGmailLabels,
  OnNewGmailTrigger,
  ReplyToGmailMessage,
  SendGmailMessage,
  type GmailMessageAttachmentRecord,
  type GmailSession,
} from "@codemation/core-nodes-gmail";

const trigger = new OnNewGmailTrigger("On inbox", {
  mailbox: "ops@example.com",
});

const attachment: GmailMessageAttachmentRecord = {
  attachmentId: "attachment_1",
  mimeType: "application/pdf",
  binaryName: "invoice_pdf",
};

const attachmentMapping = new GmailAttachmentMapping();
const mapped = attachmentMapping.toParseNodeAttachment(attachment);

const session = {
  auth: {} as never,
  client: {} as never,
  userId: "me",
  scopes: [],
} satisfies GmailSession;

const send = new SendGmailMessage("Send Gmail", {
  to: itemExpr(({ item }: Readonly<{ item: Item }>) => String((item.json as Record<string, unknown>)["to"] ?? "")),
  subject: itemExpr(({ item }: Readonly<{ item: Item }>) =>
    String((item.json as Record<string, unknown>)["subject"] ?? ""),
  ),
});
const reply = new ReplyToGmailMessage("Reply Gmail", {
  messageId: itemExpr(({ item }: Readonly<{ item: Item }>) =>
    String((item.json as Record<string, unknown>)["messageId"] ?? ""),
  ),
  text: "Thanks for your message.",
});
const labels = new ModifyGmailLabels("Label Gmail", {
  messageId: itemExpr(({ item }: Readonly<{ item: Item }>) =>
    String((item.json as Record<string, unknown>)["messageId"] ?? ""),
  ),
  addLabels: ["Done"],
});

void trigger;
void mapped;
void send;
void reply;
void labels;
void session;
