import { callableTool } from "@codemation/core";
import { workflow } from "@codemation/host";
import { AIAgent } from "@codemation/core-nodes";
import { z } from "zod";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Minimal demo: manual trigger → AIAgent with one inline callable tool.
 *
 * The system prompt forces a single tool call so manual runs reliably exercise `callableTool`.
 * Requires an OpenAI credential bound for the agent LLM slot.
 */
const doubleValueTool = callableTool({
  name: "double_value",
  description: "Returns n doubled (deterministic).",
  inputSchema: z.object({ n: z.number() }),
  outputSchema: z.object({ doubled: z.number() }),
  execute: async ({ input }) => ({ doubled: input.n * 2 }),
});

export default workflow("wf.test-dev.agent.callable-tool-demo")
  .name("Callable tool demo (manual)")
  .manualTrigger<{ seed: number }>("Start callable tool demo", [{ seed: 3 }])
  .then(
    new AIAgent<{ seed: number }, { doubledFromTool: number; done: true }>({
      name: "Callable tool demo agent",
      messages: [
        {
          role: "system",
          content:
            'You must call the double_value tool exactly once before your final JSON answer. Call it with {"n": equal to the seed from the user message}. Then respond with strict JSON only: {"doubledFromTool": number, "done": true}. doubledFromTool must equal the tool result "doubled" field.',
        },
        {
          role: "user",
          content: ({ item }) =>
            JSON.stringify({
              seed: item.json.seed,
            }),
        },
      ],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      inputSchema: z.object({ seed: z.number() }),
      tools: [doubleValueTool],
      guardrails: { maxTurns: 8 },
    }),
  )
  .build();
