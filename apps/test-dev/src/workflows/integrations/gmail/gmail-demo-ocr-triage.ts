import type { CredentialRequirement, Item } from "@codemation/core";
import { AIAgent, createWorkflowBuilder, If, NoOp } from "@codemation/core-nodes";
import {
  OnNewGmailTrigger,
  type OnNewGmailTriggerItemJson,
} from "@codemation/core-nodes-gmail/nodes/OnNewGmailTrigger";

import {
  AzureInvoiceOcrConsumer,
  type AzureContentUnderstandingSession,
  type OcrStructuredFields,
} from "../../../gmail/AzureInvoiceOcrConsumer";
import { CredentialAwareCallback } from "../../../gmail/CredentialAwareCallback";
import { GmailTriggerEnvReader } from "../../../gmail/GmailTriggerEnvReader";
import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

const gmailTriggerConfiguration = new GmailTriggerEnvReader().readTriggerConfiguration();

const azureFoundryContentUnderstandingRequirements: ReadonlyArray<CredentialRequirement> = [
  {
    slotKey: "azureFoundryContentUnderstanding",
    label: "Azure AI Content Understanding (Foundry)",
    acceptedTypes: ["azureFoundry.contentUnderstandingApiKey"],
    helpText: "Microsoft Foundry endpoint + API key for Content Understanding (prebuilt-invoice).",
  },
];

type TriageAttachmentOcrJson = Readonly<{
  filename: string;
  mimetype: string;
  content: string;
  fields: OcrStructuredFields;
}>;

type TriageEmailAggregateJson = Readonly<{
  subject: string;
  from: string;
  to: string;
  cc: string;
  message: string;
  attachments: ReadonlyArray<TriageAttachmentOcrJson>;
}>;

type TriageClassifyJson = Readonly<{
  outcome: "rfq" | "other";
  /** Short explanation (1–3 sentences) for the chosen category. */
  reasoning: string;
}>;

const ocrConsumer = new AzureInvoiceOcrConsumer();

function supportsOcrMime(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return (
    m === "application/pdf" ||
    m.startsWith("image/") ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

function resolveCc(headers: Readonly<Record<string, string>>): string {
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === "cc") {
      return v;
    }
  }
  return "";
}

export default createWorkflowBuilder({
  id: "wf.gmail.demo.ocrTriage",
  name: "Gmail Demo → Azure Content Understanding (invoice) → RFQ triage",
})
  .trigger(
    new OnNewGmailTrigger(
      "On Demo Mail (OCR triage)",
      {
        mailbox: gmailTriggerConfiguration.mailbox,
        topicName: gmailTriggerConfiguration.topicName,
        subscriptionName: gmailTriggerConfiguration.subscriptionName,
        labelIds: ["Demo"],
        query: gmailTriggerConfiguration.query,
        downloadAttachments: true,
      },
      "gmail_trigger_ocr_triage",
    ),
  )
  .then(
    new CredentialAwareCallback<OnNewGmailTriggerItemJson, TriageEmailAggregateJson>(
      "Azure OCR + aggregate mail",
      azureFoundryContentUnderstandingRequirements,
      async (items, ctx) => {
        const session = await ctx.getCredential<AzureContentUnderstandingSession>("azureFoundryContentUnderstanding");
        const out: Item<TriageEmailAggregateJson>[] = [];
        for (const item of items) {
          const j = item.json;
          const attachments: TriageAttachmentOcrJson[] = [];
          for (const att of j.attachments ?? []) {
            if (!supportsOcrMime(att.mimeType)) {
              continue;
            }
            const bin = item.binary?.[att.binaryName];
            if (!bin) {
              continue;
            }
            const body = await ocrConsumer.readBinaryBody(ctx, bin);
            const contentType = att.mimeType.trim().length > 0 ? att.mimeType : "application/octet-stream";
            const analyzed = await ocrConsumer.analyzePrebuiltInvoiceWithRetry({
              session,
              body,
              contentType,
            });
            attachments.push({
              filename: att.filename ?? att.binaryName,
              mimetype: att.mimeType,
              content: analyzed.content,
              fields: analyzed.fields,
            });
          }
          out.push({
            json: {
              subject: j.subject ?? "",
              from: j.from ?? "",
              to: j.to ?? "",
              cc: resolveCc(j.headers),
              message: j.snippet ?? "",
              attachments,
            },
          });
        }
        return out;
      },
    ),
  )
  .then(
    new AIAgent<TriageEmailAggregateJson, TriageEmailAggregateJson & TriageClassifyJson>(
      "Classify RFQ vs other",
      'You triage incoming mail for sales. You receive one JSON object with subject, from, to, cc, message (snippet/preview), and attachments (each with filename, mimetype, OCR content, and structured invoice fields). Decide if this is an RFQ (request for quote / pricing / bid) versus other. Respond with strict JSON only, no markdown. Shape: {"outcome":"rfq"|"other","reasoning":"…"}. The reasoning field must be a concise plain-text explanation (one to three short sentences) citing the strongest signals you used (subject, body/snippet, attachment types, OCR text or invoice fields).',
      (item) => JSON.stringify(item.json),
      openAiChatModelPresets.demoGpt4oMini,
    ),
  )
  .then(
    new If<TriageEmailAggregateJson & TriageClassifyJson>("Is RFQ?", (item) => {
      const j = item.json as Record<string, unknown>;
      return j["outcome"] === "rfq";
    }),
  )
  .when({
    true: [new NoOp<TriageEmailAggregateJson & TriageClassifyJson>("RFQ path (placeholder)")],
    false: [new NoOp<TriageEmailAggregateJson & TriageClassifyJson>("Send reply with instructions")],
  })
  .build();
