/**
 * @description Webhook trigger → 3-step LLM pipeline: extract entities → enrich → summarize.
 * Demonstrates the managed-LLM gateway (CodemationChatModelConfig) with chained agent steps.
 * @tags llm, aiagent, pipeline, multi-step, chained, extract, enrich, summarize, managed-gateway, style:scenario
 * @uses @codemation/core-nodes, node:AIAgent
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { CodemationChatModelConfig } from "@codemation/core-nodes";
import { z } from "zod";

type RawText = Readonly<{ text: string }>;

// All three steps use the managed Codemation gateway — no BYOK credential required.
const haiku = new CodemationChatModelConfig("Claude Haiku (managed)", "anthropic/claude-haiku-4-5-20251001");

export default workflow("example.llm-pipeline")
  .name("3-step LLM pipeline: extract → enrich → summarize")
  .manualTrigger<RawText>("Start pipeline", [
    { text: "Apple acquired Beats Electronics for $3 billion in 2014. Tim Cook led the deal." },
  ])
  // Step 1: Extract named entities.
  .agent("Step 1: Extract entities", {
    messages: [
      {
        role: "system",
        content:
          "You are an entity extractor. Identify named entities (people, orgs, amounts, dates). " +
          'Respond with strict JSON: {"entities": [{"type": string, "value": string}]}.',
      },
      {
        role: "user",
        content: (args) => `Text: ${String((args.item.json as RawText).text)}`,
      },
    ],
    model: haiku,
    outputSchema: z.object({
      entities: z.array(z.object({ type: z.string(), value: z.string() })),
    }),
    guardrails: { maxTurns: 1 },
  })
  // Step 2: Enrich with context. Input json comes from the step-1 output schema.
  .agent("Step 2: Enrich with context", {
    messages: [
      {
        role: "system",
        content:
          "Add one sentence of factual context about the most important entity. " +
          'Respond with strict JSON: {"context": string, "entities": [{"type": string, "value": string}]}.',
      },
      {
        role: "user",
        content: (args) => {
          const json = args.item.json as { entities?: unknown };
          return `Entities: ${JSON.stringify(json.entities ?? [])}`;
        },
      },
    ],
    model: haiku,
    outputSchema: z.object({
      context: z.string(),
      entities: z.array(z.object({ type: z.string(), value: z.string() })),
    }),
    guardrails: { maxTurns: 1 },
  })
  // Step 3: Produce a final summary.
  .agent("Step 3: Summarize", {
    messages: [
      {
        role: "system",
        content:
          "Produce a two-sentence summary incorporating the entities and context. " +
          'Respond with strict JSON: {"summary": string, "entityCount": number}.',
      },
      {
        role: "user",
        content: (args) => {
          const json = args.item.json as { entities?: unknown; context?: string };
          return `Entities: ${JSON.stringify(json.entities ?? [])}\nContext: ${json.context ?? ""}`;
        },
      },
    ],
    model: haiku,
    outputSchema: z.object({ summary: z.string(), entityCount: z.number() }),
    guardrails: { maxTurns: 1 },
  })
  .build();
