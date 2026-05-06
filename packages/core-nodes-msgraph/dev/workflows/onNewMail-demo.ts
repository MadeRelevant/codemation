/**
 * Minimal demo workflow for the MS Graph "On new mail" trigger.
 * Requires a Microsoft Graph OAuth credential named "auth" bound to the trigger node.
 *
 * Default uses the connected user's own inbox (mailbox: "me"). To monitor a shared mailbox,
 * set MSGRAPH_MAILBOX to the target UPN — that path requires Mail.Read.Shared scope.
 */
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";
import { onNewMsGraphMailTrigger, type MsGraphMailItem } from "../../src/index";

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
    onNewMsGraphMailTrigger.create(
      {
        mailbox: process.env["MSGRAPH_MAILBOX"] ?? "me",
        folderId: "inbox",
        pollIntervalMs: 60_000,
      },
      "On new mail",
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
