import { itemValue } from "@codemation/core";
import { workflow } from "@codemation/host";
import { AIAgent } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demonstrates AIAgent (`execute`): Zod `inputSchema` on the wire shape runs before enqueue;
 * per-item **`itemValue`** on config builds the `messages` array the agent sees (canvas I/O panel). Model, tools, and
 * guardrails stay on config.
 */
const agentWireSchema = z.object({
  topic: z.string(),
});

type AgentWireJson = z.infer<typeof agentWireSchema>;

type AgentOutJson = Readonly<{ summary: string }>;

export default workflow("wf.samples.agent-item-input")
  .name("AI agent: prompts from mapped input")
  .manualTrigger<AgentWireJson>("Start", [
    {
      topic: "Why use a workflow engine for AI steps?",
    },
  ])
  .then(
    new AIAgent<AgentWireJson, AgentOutJson>({
      name: "Summarize topic",
      messages: itemValue(({ item }) => [
        {
          role: "system",
          content: 'Respond with strict JSON only: {"summary": string} — one short sentence summarizing the topic.',
        },
        { role: "user", content: `Topic: ${item.json.topic}` },
      ]),
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      inputSchema: agentWireSchema,
      guardrails: { maxTurns: 4 },
    }),
  )
  .build();
