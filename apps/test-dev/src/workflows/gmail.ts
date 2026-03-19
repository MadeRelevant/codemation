import { OnNewGmailTrigger, type OnNewGmailTriggerItemJson } from "@codemation/core-nodes-gmail";
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";
import { TestDevGmailEnvironment } from "../bootstrap/TestDevGmailEnvironment";

const gmailEnvironment = new TestDevGmailEnvironment();
const gmailTriggerConfiguration = gmailEnvironment.resolveTriggerConfiguration();

type GmailWorkflowResultJson = Readonly<{
  mailbox: string;
  subject?: string;
  from?: string;
  messageId: string;
  labelIds: ReadonlyArray<string>;
}>;

export default createWorkflowBuilder({ id: "wf.gmail.pull", name: "Gmail pull trigger demo" })
  .trigger(
    new OnNewGmailTrigger(
      "On new Gmail message!",
      {
        mailbox: gmailTriggerConfiguration.mailbox,
        topicName: gmailTriggerConfiguration.topicName,
        subscriptionName: gmailTriggerConfiguration.subscriptionName,
        labelIds: ["Inbox"],
        query: gmailTriggerConfiguration.query,
        downloadAttachments: true,
      },
      "gmail_trigger",
    ),
  )
  .then(
    new Callback<OnNewGmailTriggerItemJson, GmailWorkflowResultJson>("Summarize Gmail event", (items) =>
      items.map((item) => ({
        json: {
          mailbox: String(item.json.mailbox),
          subject: typeof item.json.subject === "string" ? item.json.subject : undefined,
          from: typeof item.json.from === "string" ? item.json.from : undefined,
          messageId: String(item.json.messageId),
          labelIds: Array.isArray(item.json.labelIds) ? item.json.labelIds.map((value) => String(value)) : [],
        } satisfies GmailWorkflowResultJson,
      })),
    ),
  )
  .build();
