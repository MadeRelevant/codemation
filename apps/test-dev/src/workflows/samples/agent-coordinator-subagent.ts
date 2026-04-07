import { AgentToolFactory } from "@codemation/core";
import { AIAgent, createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Demo: one top-level agent (coordinator) with a nested agent exposed as a node-backed tool.
 * The coordinator uses a larger model; the embedded specialist uses a smaller one—matching the
 * “orchestrator + cheap sub-agent” pattern.
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

export default createWorkflowBuilder({
  id: "wf.test-dev.agent.subagent",
  name: "Agent coordinator + specialist (sub-agent)",
})
  .trigger(
    new ManualTrigger<CoordinatorInputJson>("Start coordinator demo", [
      {
        json: {
          topic: "When should a team prefer workflow orchestration vs a single monolithic agent?",
        },
      },
    ]),
  )
  .then(
    new AIAgent<CoordinatorInputJson, CoordinatorOutputJson>({
      name: "Coordinator",
      messages: [
        {
          role: "system",
          content:
            'You are the coordinator. Decide whether to call the specialist tool for a focused sub-answer, then produce the final result. When you call `specialist`, you must provide a non-empty `question` string derived from the current `topic`. Respond with strict JSON only: {"summary": string, "usedSpecialist": boolean}.',
        },
        { role: "user", content: ({ item }) => JSON.stringify(item.json ?? {}) },
      ],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      tools: [specialistTool],
      guardrails: { maxTurns: 8 },
    }),
  )
  .build();
