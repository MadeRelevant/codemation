/**
 * Minimal demo workflow for the MS Graph "On new mail" trigger.
 * Requires a Microsoft Graph OAuth credential named "auth" bound to the trigger node.
 *
 * Set the mailbox to your Office 365 mailbox address (e.g. user@contoso.com).
 */
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";
import { OnNewMsGraphMailTrigger, type MsGraphMailItem } from "../../src/index";

type MailSummary = Readonly<{
  messageId: string;
  from: string;
  subject: string;
  receivedAt: string;
}>;

export default createWorkflowBuilder({
  id: "wf.msgraph.mail.demo",
  name: "MS Graph — On new mail demo",
})
  .trigger(
    new OnNewMsGraphMailTrigger(
      "On new mail",
      {
        mailbox: process.env["MSGRAPH_MAILBOX"] ?? "user@contoso.com",
        folderId: "Inbox",
        pollIntervalMs: 60_000,
      },
      "msgraph_mail_trigger",
    ),
  )
  .then(
    new Callback<MsGraphMailItem, MailSummary>("Summarize mail event", (items) =>
      items.map((item) => ({
        json: {
          messageId: item.json.messageId,
          from: item.json.from?.address ?? "(unknown)",
          subject: item.json.subject ?? "(no subject)",
          receivedAt: item.json.receivedDateTime,
        } satisfies MailSummary,
      })),
    ),
  )
  .build();
