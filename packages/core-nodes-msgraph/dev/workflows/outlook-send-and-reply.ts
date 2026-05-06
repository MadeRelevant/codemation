/**
 * Demo: send a test email via Outlook using a manual trigger.
 *
 * Trigger: ManualTrigger — click "Run now" in the UI to fire.
 * The trigger emits a JSON payload with default test inputs you can
 * edit in the UI without changing code or setting env vars.
 *
 * Requires a Microsoft Graph OAuth credential named "auth" bound to
 * the OutlookMessageSend node.
 */
import { Callback, ManualTrigger, createWorkflowBuilder } from "@codemation/core-nodes";
import { outlookMessageSendNode, type OutlookMessageSendOutput } from "../../src/index";

type SendPayload = Readonly<{
  to: string;
  subject: string;
  body: string;
}>;

type SendSummary = Readonly<{
  sentTo: string;
  subject: string;
  isDraft: boolean;
  messageId: string;
}>;

export default createWorkflowBuilder({
  id: "wf.msgraph.outlook.send-demo",
  name: "MS Graph — Outlook send demo",
})
  .trigger(
    new ManualTrigger<SendPayload>(
      "Manual trigger",
      {
        to: "chris@maderelevant.com",
        subject: "Codemation Outlook test",
        body: "Hello from the demo",
      },
      "msgraph_send_manual",
    ),
  )
  .then(
    // Send a test email. The static cfg mirrors the trigger's default payload so the
    // workflow works out-of-the-box. In the UI you can wire expressions (e.g.
    // {{item.json.to}}) to pick up whatever was emitted by the trigger at runtime.
    outlookMessageSendNode.create(
      {
        mailbox: "me",
        to: ["chris@maderelevant.com"],
        subject: "Codemation Outlook test",
        body: "Hello from the demo",
        bodyType: "text",
        importance: "normal",
        // draftOnly: true returns a messageId you can pass to OutlookMessageReply.
        // Graph /sendMail (draftOnly: false, the default) returns 202 No Content — no id.
      },
      "Send test email",
      "msgraph_send_node",
    ),
  )
  .then(
    new Callback<OutlookMessageSendOutput, SendSummary>("Summarize send result", (items) =>
      items.map((item) => ({
        json: {
          sentTo: "chris@maderelevant.com",
          subject: "Codemation Outlook test",
          isDraft: item.json.isDraft,
          // Graph /sendMail returns 202 No Content — messageId is "" when not draftOnly.
          messageId: item.json.messageId,
        } satisfies SendSummary,
      })),
    ),
  )
  .build();
