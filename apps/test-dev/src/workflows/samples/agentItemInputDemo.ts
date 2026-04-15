import { itemExpr } from "@codemation/core";
import { workflow } from "@codemation/host";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demonstrates `workflow().agent(...)`: per-item **`itemExpr`** builds the same `messages`
 * contract used by `AIAgent`, while fluent `.map(...)` uses the same `item` / `ctx`
 * shape as runtime nodes before the agent runs.
 */
type AgentWireJson = {
  topic: string;
};

export default workflow("wf.samples.agent-item-input")
  .name("AI agent: prompts from mapped input")
  .manualTrigger<AgentWireJson>("Start", [
    {
      topic: "Why use a workflow engine for AI steps?",
    },
  ])
  .map<AgentWireJson>("Normalize topic", (item, _ctx) => ({
    topic: item.json.topic.trim(),
  }))
  .agent("Summarize topic", {
    messages: itemExpr(({ item }) => [
      {
        role: "system",
        content: 'Respond with strict JSON only: {"summary": string} — one short sentence summarizing the topic.',
      },
      { role: "user", content: `Topic: ${item.json.topic}` },
    ]),
    model: openAiChatModelPresets.demoGpt4oMini,
    outputSchema: z.object({
      summary: z.string(),
    }),
    guardrails: { maxTurns: 4 },
  })
  .build();
