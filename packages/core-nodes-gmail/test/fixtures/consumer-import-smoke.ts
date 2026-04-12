import {
  GmailAttachmentMapping,
  GoogleGmailApiClientFactory,
  OnNewGmailTrigger,
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

const client = new GoogleGmailApiClientFactory().create(session);

void trigger;
void mapped;
void client;
