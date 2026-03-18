import { credentialId, credentialRef } from "@codemation/core";
import type { GmailServiceAccountCredential } from "@codemation/core-nodes-gmail";
import { OnNewGmailTrigger, type OnNewGmailTriggerItemJson } from "@codemation/core-nodes-gmail";
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";

const GMAIL_SERVICE_ACCOUNT = credentialId<GmailServiceAccountCredential>("gmail.serviceAccount");

type GmailWorkflowResultJson = Readonly<{
  mailbox: string;
  subject?: string;
  from?: string;
  messageId: string;
  labelIds: ReadonlyArray<string>;
}>;

class TestDevGmailEnvironment {
  private resolveLabelIds(): ReadonlyArray<string> | undefined {
    const rawValue = process.env.GMAIL_TRIGGER_LABEL_IDS;
    if (!rawValue) {
      return undefined;
    }
    const labelIds = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return labelIds.length > 0 ? labelIds : undefined;
  }

  static readonly labelIds = new TestDevGmailEnvironment().resolveLabelIds();
}

export default createWorkflowBuilder({ id: "wf.gmail.pull", name: "Gmail pull trigger demo" })
  .trigger(
    new OnNewGmailTrigger(
      "On new Gmail message",
      {
        mailbox: process.env.GMAIL_TRIGGER_MAILBOX ?? "",
        credential: credentialRef(GMAIL_SERVICE_ACCOUNT),
        topicName: process.env.GMAIL_TRIGGER_TOPIC_NAME ?? "",
        subscriptionName: process.env.GMAIL_TRIGGER_SUBSCRIPTION_NAME ?? "",
        labelIds: TestDevGmailEnvironment.labelIds,
        query: process.env.GMAIL_TRIGGER_QUERY,
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
