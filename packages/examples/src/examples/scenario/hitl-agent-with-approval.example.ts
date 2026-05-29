/**
 * @description Customer-support agent that triages a refund request and asks
 *              a human for approval when the refund exceeds €100. Lower-stakes
 *              decisions are returned to the agent (it adapts and answers);
 *              high-stakes decisions halt the run if rejected.
 *              Demonstrates the same inboxApproval node bound twice as agent
 *              tools with different onRejected behaviors (story 10).
 * @tags hitl, agent, customer-support, refund, audit, inbox, style:scenario
 * @uses @codemation/core-nodes, node:AIAgent, node:inboxApproval (as tool)
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow as buildWorkflow, inboxApproval, CodemationChatModelConfig } from "@codemation/core-nodes";
import { AgentToolFactory } from "@codemation/core";
import { z } from "zod";
import type { Item, RunnableNodeConfig } from "@codemation/core";

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

type RefundRequest = Readonly<{
  customerId: string;
  orderId: string;
  reason: string;
  amountCents: number;
}>;

// ---------------------------------------------------------------------------
// Chat model — managed gateway, no BYOK credential required.
// ---------------------------------------------------------------------------

const haiku = new CodemationChatModelConfig("Claude Haiku (managed)", "anthropic/claude-haiku-4-5-20251001");

// ---------------------------------------------------------------------------
// HITL tool bindings
//
// inboxApproval.create({...}) returns a RunnableNodeConfig. The config uses
// title/body callbacks that read item.json.title / item.json.body so the actual
// title/body come from the item at execution time (set via mapInput).
//
// inboxApproval has humanApprovalToolBehavior = { onRejected: "return" } by
// default (set by defineHumanApprovalNode on the DefinedNode). For the halt
// variant we clone the created RunnableNodeConfig and override the marker.
//
// TODO(story-10-followup): once ToolConfig accepts a per-binding override for
// humanApprovalToolBehavior, move this override to the tool binding instead of
// cloning the node config.
// ---------------------------------------------------------------------------

// Base node config using title/body callbacks — the agent populates title/body via mapInput.
// We add humanApprovalToolBehavior directly so the agent runtime detects this as a HITL
// tool and appends the solo-constraint sentence to its description (story 10).
const inboxApprovalNodeConfig: RunnableNodeConfig<any, any> = Object.assign(
  inboxApproval.create(
    {
      title: ({ item }: { item: Item }) => String((item.json as { title?: unknown }).title ?? ""),
      body: ({ item }: { item: Item }) => String((item.json as { body?: unknown }).body ?? ""),
      priority: "normal",
      timeout: "24h",
      onTimeout: "halt",
    },
    "Inbox approval (soft)",
  ),
  { humanApprovalToolBehavior: { onRejected: "return" as const } },
);

// Halt variant: same shape, humanApprovalToolBehavior overridden to "halt".
const inboxApprovalNodeConfigHalt: RunnableNodeConfig<any, any> = Object.assign(
  inboxApproval.create(
    {
      title: ({ item }: { item: Item }) => String((item.json as { title?: unknown }).title ?? ""),
      body: ({ item }: { item: Item }) => String((item.json as { body?: unknown }).body ?? ""),
      priority: "high",
      timeout: "8h",
      onTimeout: "halt",
    },
    "Inbox approval (critical)",
  ),
  { humanApprovalToolBehavior: { onRejected: "halt" as const } },
);

// Approval input schema: what the LLM passes when it calls either approval tool.
const approvalInputSchema = z.object({
  title: z.string().describe("Short summary for the reviewer (e.g. 'Refund €149.99 for order ORD-9999')"),
  reason: z.string().describe("Agent's reasoning for escalating to a human"),
});

// Decision output schema: the reviewer's approve/reject + optional note.
const approvalOutputSchema = z.object({
  approved: z.boolean(),
  note: z.string().optional(),
});

// Shared mapOutput: reads the decision from the node's main output item.
function mapApprovalOutput({ outputs }: { outputs: { main?: ReadonlyArray<{ json: unknown }> } }) {
  const first = outputs.main?.[0]?.json as { decision?: { status?: string; note?: string } } | undefined;
  return {
    approved: first?.decision?.status === "approved",
    note: first?.decision?.note,
  };
}

// Tool 1: CRITICAL — halt if the reviewer rejects.
// Use for refunds over €100 or anything escalated by the customer.
const requestApprovalCritical = AgentToolFactory.asTool(inboxApprovalNodeConfigHalt, {
  name: "request_human_approval_critical",
  description:
    "Request human approval for a high-value or sensitive refund decision. " +
    "The reviewer's decision is binding — if they reject, the workflow halts. " +
    "Use this for refunds over €100 or anything explicitly escalated.",
  inputSchema: approvalInputSchema,
  outputSchema: approvalOutputSchema,
  mapInput: ({ input, item }) => ({
    json: {
      ...((item.json as Record<string, unknown>) ?? {}),
      title: input.title,
      body: `Customer ${String((item.json as RefundRequest).customerId)}: ${input.reason} — ${String((item.json as RefundRequest).amountCents)}¢`,
      priority: "high",
      timeout: "8h",
      onTimeout: "halt",
    },
  }),
  mapOutput: mapApprovalOutput,
});

// Tool 2: SOFT — return the rejection to the agent so it can adapt.
// Use for borderline amounts (near €100) or ambiguous policy cases.
const requestApprovalSoft = AgentToolFactory.asTool(inboxApprovalNodeConfig, {
  name: "request_human_approval_soft",
  description:
    "Request a human's opinion on a borderline refund decision. The reviewer's " +
    "answer is returned to you; you decide how to act on it. Use this for amounts " +
    "near €100 or when you are unsure about the applicable policy.",
  inputSchema: approvalInputSchema,
  outputSchema: approvalOutputSchema,
  mapInput: ({ input, item }) => ({
    json: {
      ...((item.json as Record<string, unknown>) ?? {}),
      title: input.title,
      body: `Customer ${String((item.json as RefundRequest).customerId)}: ${input.reason} — ${String((item.json as RefundRequest).amountCents)}¢`,
      priority: "normal",
      timeout: "4h",
      onTimeout: "halt",
    },
  }),
  mapOutput: mapApprovalOutput,
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export const workflow = buildWorkflow("example.hitl-agent-refund")
  .name("Refund triage agent with HITL")
  .manualTrigger<RefundRequest>("Submit refund request", [
    { customerId: "cust-001", orderId: "ORD-9999", reason: "Item arrived damaged", amountCents: 14999 },
    { customerId: "cust-002", orderId: "ORD-8888", reason: "Wrong item shipped", amountCents: 8500 },
  ])
  .agent("Refund triage agent", {
    id: "refund-agent",
    model: haiku,
    messages: [
      {
        role: "system",
        content:
          "You are a customer-support agent for a European e-commerce company.\n" +
          "Refunds under €100 (10000¢) you can approve yourself with a clear written justification.\n" +
          "For refunds over €100, use request_human_approval_critical — these require a human " +
          "sign-off and will halt if rejected.\n" +
          "For borderline cases (close to €100), use request_human_approval_soft — the human's " +
          "call is returned to you and you can adapt your final response.\n" +
          "Always end with a final resolution message to the customer.",
      },
      {
        role: "user",
        content: ({ item }) => {
          const r = item.json as RefundRequest;
          return (
            `Refund request:\n` +
            `  Customer: ${r.customerId}\n` +
            `  Order:    ${r.orderId}\n` +
            `  Reason:   ${r.reason}\n` +
            `  Amount:   ${r.amountCents}¢ (${(r.amountCents / 100).toFixed(2)} EUR)`
          );
        },
      },
    ],
    tools: [requestApprovalCritical, requestApprovalSoft],
    outputSchema: z.object({ resolution: z.string() }),
    guardrails: { maxTurns: 10 },
  })
  .build();

export const sampleInput: RefundRequest = {
  customerId: "cust-001",
  orderId: "ORD-9999",
  reason: "Item arrived damaged",
  amountCents: 14999,
};

export default workflow;
