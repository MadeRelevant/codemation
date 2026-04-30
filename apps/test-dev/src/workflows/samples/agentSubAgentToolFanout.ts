import { AgentToolFactory, itemExpr } from "@codemation/core";
import { workflow } from "@codemation/host";
import { AIAgent } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Manual reproducer for the execution-inspector tool-call rendering and tree auto-follow flows,
 * plus the right-side properties panel's per-item invocation grouping and tree-driven focus.
 *
 * Topology: trigger emits **2 items** → orchestrator agent processes them in parallel → each
 * activation calls the sub-agent registered as the `searchInMail` tool four times. Across both
 * items this fans out into ~10 LLM invocations and 8 tool invocations on the same connection
 * nodes, which puts the multi-item UX under real load.
 *
 * Verification steps (after wiring OpenAI credentials and starting `pnpm dev:consumer`):
 *   1. Open the workflow detail page and click the run button.
 *   2. In the execution inspector, both orchestrator activations should expand independently and
 *      each fan out into its own four `searchInMail` rows (queued → running → completed). Rows
 *      do NOT collapse into a single shared row.
 *   3. The "Follow active node" toggle keeps the most recently running row in view. Manual
 *      scrolling pauses follow until the toggle is re-armed.
 *   4. Click the orchestrator's LLM connection node on the canvas. The right-side panel's
 *      "Model responses" section shows two top-level `Item N` accordions (one per trigger item),
 *      each containing its own LLM rounds as children. Same for the `searchInMail` tool node
 *      under "Tool inputs and outputs".
 *   5. Click any single LLM-round row in the bottom execution tree. The right-side panel
 *      switches to focused mode showing a breadcrumb (`Item X of 2 · Round Y of N`) and prev/next
 *      chevrons. Walking prev/next traverses every round across both items in chronological
 *      order; boundary buttons disable at the first/last invocation.
 */
type FanoutInputJson = Readonly<{
  query: string;
}>;

type FanoutOutputJson = Readonly<{
  status: "done";
  callsMade: number;
}>;

const fanoutWireSchema = z.object({
  query: z.string(),
});

const inboxAgent = new AIAgent<Readonly<{ query: string }>, Readonly<{ summary: string }>>({
  name: "Inbox specialist",
  messages: [
    {
      role: "system",
      content:
        'You are an inbox lookup specialist. Given a single `query`, return strict JSON: {"summary": string}. Keep the summary short (one sentence).',
    },
    { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
  ],
  chatModel: openAiChatModelPresets.demoGpt4oMini,
  guardrails: { maxTurns: 2 },
});

const searchInMailTool = AgentToolFactory.asTool(inboxAgent, {
  name: "searchInMail",
  description:
    "Look up a single targeted query in the user's mail. Always call multiple times in parallel for distinct queries instead of asking one broad question.",
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ summary: z.string() }),
  mapInput: ({ input }) => ({ query: input.query }),
});

export default workflow("wf.test-dev.agent.subagent.fanout")
  .name("Agent fan-out reproducer (2 items × 4 searchInMail)")
  .manualTrigger<FanoutInputJson>("Start fan-out", [
    {
      query: "Find recent inbound RFQ emails for review.",
    },
    {
      query: "Find unanswered customer support emails from this week.",
    },
  ])
  .then(
    new AIAgent<FanoutInputJson, FanoutOutputJson>({
      name: "Mail orchestrator",
      messages: itemExpr(({ item }) => [
        {
          role: "system",
          content:
            'You orchestrate inbox lookups. Call the `searchInMail` tool exactly 4 times in your first turn with distinct, narrow queries derived from the user input. Then produce strict JSON: {"status": "done", "callsMade": 4}. Do not return any other text.',
        },
        { role: "user", content: JSON.stringify({ query: item.json.query }) },
      ]),
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      inputSchema: fanoutWireSchema,
      tools: [searchInMailTool],
      guardrails: { maxTurns: 6 },
    }),
  )
  .build();
