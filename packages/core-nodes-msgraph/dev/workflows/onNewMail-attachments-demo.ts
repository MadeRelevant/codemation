/**
 * Demo workflow that only fires for messages that actually have attachments and pulls
 * the attachment payloads (base64) inline on each emitted item.
 *
 * Two settings drive this:
 *   - `filter: "hasAttachments eq true"` — server-side OData filter so the Graph API only
 *     returns messages with attachments. This stays fully open: any valid Graph $filter
 *     expression works (e.g. `"isRead eq false and from/emailAddress/address eq 'x@y.com'"`).
 *   - `downloadAttachments: true` — adds `$expand=attachments` so the response carries the
 *     attachment metadata + base64 contentBytes inline. Otherwise attachments are omitted
 *     from the message payload (you can still fetch them yourself by id later).
 *
 * Requires a Microsoft Graph OAuth credential bound to the trigger's `auth` slot.
 */
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";
import { OnNewMsGraphMailTrigger, type MsGraphMailItem } from "../../src/index";

type AttachmentSummary = Readonly<{
  messageId: string;
  from: string;
  subject: string;
  attachmentCount: number;
  attachmentNames: ReadonlyArray<string>;
  totalBytes: number;
}>;

export default createWorkflowBuilder({
  id: "wf.msgraph.mail.attachments-demo",
  name: "MS Graph — On new mail with attachments",
})
  .trigger(
    new OnNewMsGraphMailTrigger(
      "On new mail with attachment",
      {
        mailbox: process.env["MSGRAPH_MAILBOX"] ?? "me",
        folderId: "inbox",
        // Server-side filter: only messages that have at least one attachment.
        filter: "hasAttachments eq true",
        // Inline attachment payloads (base64) on each emitted message.
        downloadAttachments: true,
        pollIntervalMs: 60_000,
      },
      "msgraph_mail_attachments_trigger",
    ),
  )
  .then(
    new Callback<MsGraphMailItem, AttachmentSummary>("Summarize attachments", (items) =>
      items.map((item) => {
        const attachments = item.json.attachments ?? [];
        return {
          json: {
            messageId: item.json.messageId,
            from: item.json.from?.address ?? "(unknown)",
            subject: item.json.subject ?? "(no subject)",
            attachmentCount: attachments.length,
            attachmentNames: attachments.map((a) => a.name),
            totalBytes: attachments.reduce((sum, a) => sum + (a.size ?? 0), 0),
          } satisfies AttachmentSummary,
        };
      }),
    ),
  )
  .build();
