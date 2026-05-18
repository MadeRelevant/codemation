/**
 * @description Manual trigger → AIAgent with an inline callableTool → agent invokes the tool to look up a user by email.
 * Demonstrates the raw AIAgent constructor wired with a callableTool for tool-calling scenarios.
 * Use this when the agent must fetch or compute data mid-conversation rather than relying solely on its training.
 * @tags llm, aiagent, agent, tools, tool-calling, callable-tool, lookup, managed-gateway, style:node
 * @uses @codemation/core-nodes, node:AIAgent, callableTool
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { callableTool } from "@codemation/core";
import { workflow } from "@codemation/host";
import { AIAgent, CodemationChatModelConfig } from "@codemation/core-nodes";
import { z } from "zod";

type UserQueryInput = Readonly<{ question: string }>;

// Managed gateway — no BYOK credential required.
const haiku = new CodemationChatModelConfig("Claude Haiku (managed)", "anthropic/claude-haiku-4-5-20251001");

// Inline tool: the agent calls this when it needs to resolve a user by email.
// In production, replace the mock lookup with a real DB/API call via ctx.collections or HttpRequest.
const lookupUserByEmail = callableTool({
  name: "lookup_user_by_email",
  description: "Look up a user record by their email address. Returns name and role.",
  inputSchema: z.object({ email: z.string().email() }),
  outputSchema: z.object({ name: z.string(), role: z.string() }),
  execute: async ({ input }) => {
    // Simulated lookup — replace with ctx.collections.findOne(...) or an HttpRequest call.
    const users: Record<string, { name: string; role: string }> = {
      "alice@example.com": { name: "Alice Nguyen", role: "admin" },
      "bob@example.com": { name: "Bob Smith", role: "viewer" },
    };
    return users[input.email] ?? { name: "Unknown", role: "unknown" };
  },
});

export default workflow("example.node-aiagent-with-tools")
  .name("AIAgent: tool-calling — look up user by email")
  .manualTrigger<UserQueryInput>("Ask about a user", [
    { question: "Who is alice@example.com?" },
    { question: "What role does bob@example.com have?" },
  ])
  // Use AIAgent with tools when the agent must retrieve or compute information during a turn.
  // `tools` is a ReadonlyArray<ToolConfig>; callableTool is the inline helper (no separate class needed).
  // The model decides when to call a tool; guardrails.maxTurns caps the tool-calling loop.
  .then(
    new AIAgent<UserQueryInput>({
      name: "User lookup agent",
      id: "user-lookup-agent",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. When asked about a user, use the lookup_user_by_email tool " +
            "to fetch their record and answer in plain English.",
        },
        {
          role: "user",
          content: ({ item }) => item.json.question,
        },
      ],
      chatModel: haiku,
      tools: [lookupUserByEmail],
      guardrails: { maxTurns: 3 },
    }),
  )
  .build();
