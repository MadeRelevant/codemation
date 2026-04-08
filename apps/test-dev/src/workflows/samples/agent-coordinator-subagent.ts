import { AgentToolFactory } from "@codemation/core";
import { workflow } from "@codemation/host";
import { AIAgent } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demo: one top-level agent (coordinator) with a nested agent exposed as a node-backed tool.
 * The coordinator uses a larger model; the embedded specialist uses a smaller one—matching the
 * “orchestrator + cheap sub-agent” pattern.
 *
 * The coordinator uses **`mapInput` + `inputSchema`** (ItemNode) so persisted run inputs include the resolved
 * **`messages`** array; wire type is the manual trigger payload (`topic` only).
 *
 * Requires OpenAI credentials bound for both connection slots (coordinator LLM + specialist LLM).
 */
type CoordinatorInputJson = Readonly<{
  topic: string;
}>;

type CoordinatorOutputJson = Readonly<{
  summary: string;
  usedSpecialist: boolean;
}>;

/** Persisted + validated input for the coordinator ItemNode (`messages` built in `mapInput` from the trigger wire). */
const coordinatorAgentInputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1),
});

type CoordinatorAgentInput = z.infer<typeof coordinatorAgentInputSchema>;

const specialistAgent = new AIAgent<Readonly<{ topic?: string; question?: string }>, Readonly<{ answer: string }>>({
  name: "Specialist (sub-agent)",
  messages: [
    {
      role: "system",
      content:
        'You answer focused sub-questions only. Use `question` when it is present; otherwise fall back to `topic` from the parent coordinator context. Respond with strict JSON: {"answer": string}. The answer should be one short paragraph.',
    },
    { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
  ],
  chatModel: openAiChatModelPresets.demoGpt4oMini,
  guardrails: { maxTurns: 4 },
});

const specialistTool = AgentToolFactory.asTool(specialistAgent, {
  name: "specialist",
  description:
    "Ask the specialist a narrow follow-up question about the current topic. Use when a deeper but bounded answer helps.",
  inputSchema: z.object({
    question: z.string().min(1),
  }),
  outputSchema: z.object({
    answer: z.string(),
  }),
  mapInput: ({ input, item }) => ({
    topic: String((item.json as { topic?: unknown }).topic ?? ""),
    question: input.question,
  }),
});

export default workflow("wf.test-dev.agent.subagent")
  .name("Agent coordinator + specialist (sub-agent)")
  .manualTrigger<CoordinatorInputJson>("Start coordinator demo", [
    {
      topic: "When should a team prefer workflow orchestration vs a single monolithic agent?",
    },
  ])
  .then(
    new AIAgent<CoordinatorAgentInput, CoordinatorOutputJson, CoordinatorInputJson>({
      name: "Coordinator",
      messages: [{ role: "user", content: "Fallback when input.messages is not set." }],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      inputSchema: coordinatorAgentInputSchema,
      mapInput: ({ item }) => ({
        messages: [
          {
            role: "system",
            content:
              'You are the coordinator. Decide whether to call the specialist tool for a focused sub-answer, then produce the final result. When you call `specialist`, you must provide a non-empty `question` string derived from the current `topic`. Respond with strict JSON only: {"summary": string, "usedSpecialist": boolean}.',
          },
          { role: "user", content: JSON.stringify({ topic: item.json.topic }) },
        ],
      }),
      tools: [specialistTool],
      guardrails: { maxTurns: 8 },
    }),
  )
  .build();
