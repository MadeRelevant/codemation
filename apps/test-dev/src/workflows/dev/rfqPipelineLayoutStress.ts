import { AgentToolFactory, callableTool, itemExpr } from "@codemation/core";
import { workflow } from "@codemation/host";
import { Aggregate, AIAgent, Callback, MapData, Split } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Layout-stress facsimile of the ERP `mailToRfq` demo (see
 * `erp-demo-codemation/src/workflows/erp/mailToRfq.ts`).
 *
 * This workflow mirrors the *shape* of the screenshot that motivated the
 * Dagre → ELK migration — a multi-lane if-gate where the true branch contains
 * an AI-agent with two nested sub-agents exposed as tools, and the false branch
 * contains an AI-agent with an inline callable tool — using **only** the nodes
 * already available in this monorepo (`Split`, `Aggregate`, `Callback`,
 * `MapData`, `AIAgent`, `AgentToolFactory.asTool`, `callableTool`). There is
 * no Odoo / Gmail / Azure integration; the payloads are stubbed so the graph
 * compiles and can be opened in the workflow canvas without credentials.
 *
 * Open the canvas at `/workflows/wf.dev.rfqPipelineLayoutStress`.
 */
type MailJson = Readonly<{
  messageId: string;
  attachments: readonly string[];
  mailThreadWithHeaders: string;
  attachmentsSummary: string;
}>;

type StitchedMailJson = MailJson &
  Readonly<{
    ocrSnippets: readonly string[];
  }>;

type GateVerdict = Readonly<{
  nextAction: "process_rfq" | "human_review";
  messageId: string;
  reasoning: string;
  confidence: number;
  isRfq: boolean;
}>;

type RfqDomainJson = Readonly<{
  rfqReference: string | null;
  customerReference: string | null;
  lineItems: ReadonlyArray<Readonly<{ description: string; quantity: number }>>;
}>;

type HumanReplyJson = Readonly<{ reply: string }>;

type PipelineResult = Readonly<{
  outcome: "done";
  path: "rfq" | "human";
  note: string;
}>;

/** Inline tool exposed to the searchInMail sub-agent: highlight a keyword's position in the thread. */
const highlightKeywordTool = callableTool({
  name: "highlightKeyword",
  description: "Return approximate byte offsets for a keyword in the stitched mail thread (stub).",
  inputSchema: z.object({ keyword: z.string().min(1) }),
  outputSchema: z.object({ offsets: z.array(z.number()) }),
  execute: async ({ input }) => ({ offsets: input.keyword.length > 0 ? [0, 42] : [] }),
});

/** Nested retrieval sub-agent: returns verbatim snippets per query. */
const searchInMailAgent = new AIAgent<Readonly<{ queries: readonly string[] }>, Readonly<{ evidence: readonly string[] }>>({
  name: "searchInMail",
  messages: [
    {
      role: "system",
      content:
        'You return verbatim snippets from the customer mail thread and attachment OCR per query. Respond with strict JSON only: {"evidence": string[]}.',
    },
    { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
  ],
  chatModel: openAiChatModelPresets.demoGpt4oMini,
  tools: [highlightKeywordTool],
  guardrails: { maxTurns: 3 },
});

const searchInMailTool = AgentToolFactory.asTool(searchInMailAgent, {
  name: "searchInMail",
  description: "Verbatim snippets from the mail thread / attachment OCR for each query.",
  inputSchema: z.object({ queries: z.array(z.string().min(1)).min(1) }),
  outputSchema: z.object({ evidence: z.array(z.string()) }),
});

/** Inline tool exposed to the askAboutMail sub-agent: look up the customer reference. */
const lookupCustomerRefTool = callableTool({
  name: "lookupCustomerRef",
  description: "Look up the customer's reference code in the CRM (stub).",
  inputSchema: z.object({ messageId: z.string().min(1) }),
  outputSchema: z.object({ customerReference: z.string() }),
  execute: async ({ input }) => ({ customerReference: `CR-${input.messageId.slice(-4)}` }),
});

/** Nested decision sub-agent: returns a single concise answer. */
const askAboutMailAgent = new AIAgent<Readonly<{ question: string }>, Readonly<{ answer: string }>>({
  name: "askAboutMail",
  messages: [
    {
      role: "system",
      content:
        'Answer a single focused yes/no or disambiguation question about the customer mail. Respond with strict JSON only: {"answer": string}.',
    },
    { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
  ],
  chatModel: openAiChatModelPresets.demoGpt4oMini,
  tools: [lookupCustomerRefTool],
  guardrails: { maxTurns: 3 },
});

const askAboutMailTool = AgentToolFactory.asTool(askAboutMailAgent, {
  name: "askAboutMail",
  description: "One focused question → concise answer from the mail context.",
  inputSchema: z.object({ question: z.string().min(1) }),
  outputSchema: z.object({ answer: z.string() }),
});

/** Inline callable tool used by the human-review agent on the false branch. */
const sendGmailReplyTool = callableTool({
  name: "sendGmailReply",
  description: "Send a Gmail reply to the customer thread (stub — returns sent=true deterministically).",
  inputSchema: z.object({
    messageId: z.string().min(1),
    body: z.string().min(1),
  }),
  outputSchema: z.object({ sent: z.boolean() }),
  execute: async ({ input }) => ({ sent: Boolean(input.messageId) && Boolean(input.body) }),
});

const rfqSchema = z.object({
  rfqReference: z.string().nullable(),
  customerReference: z.string().nullable(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
    }),
  ),
});

const gateSchema = z.object({
  nextAction: z.enum(["process_rfq", "human_review"]),
  messageId: z.string(),
  reasoning: z.string(),
  confidence: z.number(),
  isRfq: z.boolean(),
});

const humanReplySchema = z.object({ reply: z.string() });

export default workflow("wf.dev.rfqPipelineLayoutStress")
  .name("RFQ pipeline — layout stress")
  .manualTrigger<MailJson>("Manual mail trigger", [
    {
      messageId: "msg-stress-1",
      attachments: ["rfq.pdf", "line-items.xlsx"],
      mailThreadWithHeaders: "From: buyer@example.com\nSubject: RFQ-0001\n\nPlease quote for the attached items.",
      attachmentsSummary: "rfq.pdf (2 pages), line-items.xlsx (12 rows)",
    },
  ])
  .then(
    new MapData<MailJson>("Mail data", (item) => ({ ...item.json })),
  )
  .then(
    new Split<MailJson, string>("One per attachment", (item) => [...item.json.attachments]),
  )
  .then(
    new Callback<string>("OCR attachment (stub)", (items) => items),
  )
  .agent("Classify attachment", {
    messages: itemExpr(({ item }) => [
      { role: "system" as const, content: "Classify the attachment (rfq, line-items, other). JSON only." },
      { role: "user" as const, content: JSON.stringify(item.json) },
    ]),
    model: openAiChatModelPresets.demoGpt4oMini,
    outputSchema: z.object({ classification: z.string() }),
  })
  .then(
    new Aggregate<Readonly<{ classification: string }>, StitchedMailJson>(
      "Stitch mail + OCR",
      (items) => ({
        messageId: "msg-stress-1",
        attachments: ["rfq.pdf", "line-items.xlsx"],
        mailThreadWithHeaders: "stitched-thread",
        attachmentsSummary: `classified=${items.map((i) => i.json.classification).join(",")}`,
        ocrSnippets: items.map((i) => i.json.classification),
      }),
    ),
  )
  .then(
    new Split<StitchedMailJson, StitchedMailJson>("One per stitched mail", (item) => [item.json]),
  )
  .agent("Classify mail (gatekeeper)", {
    messages: itemExpr(({ item }) => [
      {
        role: "system" as const,
        content:
          'Decide whether this stitched customer mail is an RFQ (→ "process_rfq") or needs human review (→ "human_review"). JSON only per the output schema.',
      },
      { role: "user" as const, content: JSON.stringify(item.json) },
    ]),
    model: openAiChatModelPresets.demoGpt4oMini,
    outputSchema: gateSchema,
  })
  .if("RFQ gate", (item) => (item.json as GateVerdict).nextAction === "process_rfq", {
    true: (branch) =>
      branch
        .map("Merge gate + mail context (rfq)", (item) => item.json)
        .agent("Extract RFQ domain", {
          messages: itemExpr(({ item }) => [
            {
              role: "system" as const,
              content:
                "You extract ONE RFQ domain object from a stitched customer mail. Use searchInMail and askAboutMail sub-agents as tools to gather evidence before assembling the final JSON. Respond JSON only.",
            },
            { role: "user" as const, content: JSON.stringify(item.json) },
          ]),
          model: openAiChatModelPresets.demoGpt41,
          tools: [searchInMailTool, askAboutMailTool],
          guardrails: { maxTurns: 6 },
          outputSchema: rfqSchema,
        })
        .map<Record<string, unknown>>("Prepare Odoo sale order", (item) => {
          const rfq = item.json as RfqDomainJson;
          return {
            model: "sale.order",
            values: {
              origin: rfq.rfqReference ?? "",
              client_order_ref: rfq.customerReference ?? "",
            },
          };
        })
        .then(
          new Callback<Record<string, unknown>>("Create sale order in Odoo (stub)", (items) =>
            items.map((i) => ({ ...i, json: { ...(i.json as Record<string, unknown>), id: 4242 } })),
          ),
        )
        .map<PipelineResult>("RFQ path — done", () => ({
          outcome: "done",
          path: "rfq",
          note: "sale.order created (stub id=4242)",
        })),
    false: (branch) =>
      branch
        .map("Merge gate + mail context (human)", (item) => item.json)
        .agent("Human review + Gmail reply", {
          messages: itemExpr(({ item }) => [
            {
              role: "system" as const,
              content:
                "Write a short human-review Gmail reply to the customer. Call the sendGmailReply tool exactly once. Respond JSON only per the output schema.",
            },
            { role: "user" as const, content: JSON.stringify(item.json) },
          ]),
          model: openAiChatModelPresets.demoGpt4oMini,
          tools: [sendGmailReplyTool],
          guardrails: { maxTurns: 3 },
          outputSchema: humanReplySchema,
        })
        .map<PipelineResult>("Human path — done", (item) => ({
          outcome: "done",
          path: "human",
          note: (item.json as HumanReplyJson).reply.slice(0, 80),
        })),
  })
  .map("Validate result", (item) => item.json as PipelineResult)
  .build();
