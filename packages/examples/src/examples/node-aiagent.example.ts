/**
 * @description Manual trigger → AIAgent classifies customer feedback → output is a typed JSON label.
 * Demonstrates the raw AIAgent node constructor (not the .agent() fluent helper) with a managed
 * Codemation chat model and a Zod outputSchema for structured responses.
 * @tags llm, aiagent, classification, agent, structured-output, zod, managed-gateway, style:node
 * @uses @codemation/core-nodes, node:AIAgent
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { AIAgent, CodemationChatModelConfig } from "@codemation/core-nodes";
import { z } from "zod";

type FeedbackInput = Readonly<{ text: string }>;

type ClassificationOutput = Readonly<{
  sentiment: "positive" | "neutral" | "negative";
  topic: string;
}>;

// Managed gateway — no BYOK credential required. The chatModel arg is `chatModel` (not `model`).
const haiku = new CodemationChatModelConfig("Claude Haiku (managed)", "anthropic/claude-haiku-4-5-20251001");

export default workflow("example.node-aiagent")
  .name("AIAgent: classify customer feedback")
  .manualTrigger<FeedbackInput>("Classify feedback", [
    { text: "The new onboarding flow is really intuitive — great job!" },
    { text: "Couldn't find the export button anywhere, very confusing." },
    { text: "Delivery was on time. Nothing to complain about." },
  ])
  // Use AIAgent when a workflow step needs LLM reasoning: classification, extraction, drafting.
  // Pair with outputSchema (Zod) to get structured, typed output from the model.
  // The `chatModel` field accepts CodemationChatModelConfig (managed) or OpenAiChatModelConfig (BYOK).
  .then(
    new AIAgent<FeedbackInput, ClassificationOutput>({
      name: "Classify feedback",
      id: "classify-feedback-agent",
      messages: [
        {
          role: "system",
          content:
            "Classify the customer feedback below. " +
            'Respond with strict JSON: {"sentiment": "positive"|"neutral"|"negative", "topic": string}.',
        },
        {
          role: "user",
          content: ({ item }) => `Feedback: ${item.json.text}`,
        },
      ],
      chatModel: haiku,
      outputSchema: z.object({
        sentiment: z.enum(["positive", "neutral", "negative"]),
        topic: z.string(),
      }),
      guardrails: { maxTurns: 1 },
    }),
  )
  .build();
