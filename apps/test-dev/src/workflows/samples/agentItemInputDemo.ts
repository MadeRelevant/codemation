import { workflow } from "@codemation/host";
import { AIAgent } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demonstrates AIAgent as an ItemNode (`executeOne`): `mapInput` + `inputSchema` run before enqueue, so persisted
 * run inputs include the resolved `messages` array (canvas I/O panel). Model, tools, and guardrails stay on config.
 */
const agentPromptInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

type AgentPromptInput = z.infer<typeof agentPromptInputSchema>;

type SeedJson = Readonly<{ topic: string }>;

type AgentOutJson = Readonly<{ summary: string }>;

export default workflow("wf.samples.agent-item-input")
  .name("AI agent: prompts from mapped input")
  .manualTrigger<SeedJson>("Start", [
    {
      topic: "Why use a workflow engine for AI steps?",
    },
  ])
  .then(
    new AIAgent<AgentPromptInput, AgentOutJson, SeedJson>({
      name: "Summarize topic",
      messages: [{ role: "user", content: "Fallback when input.messages is not set." }],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      inputSchema: agentPromptInputSchema,
      mapInput: ({ item }) => ({
        messages: [
          {
            role: "system",
            content: 'Respond with strict JSON only: {"summary": string} — one short sentence summarizing the topic.',
          },
          { role: "user", content: `Topic: ${item.json.topic}` },
        ],
      }),
      guardrails: { maxTurns: 4 },
    }),
  )
  .build();
