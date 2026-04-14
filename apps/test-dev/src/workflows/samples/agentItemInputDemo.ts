import { itemValue } from "@codemation/core";
import { workflow } from "@codemation/host";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demonstrates `workflow().agent(...)`: per-item **`itemValue`** builds the same `messages`
 * contract used by `AIAgent`, while model and guardrails stay on config.
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
  .agent("Summarize topic", {
    messages: itemValue(({ item }) => [
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
