import { AIAgent, CronTrigger, createWorkflowBuilder, openAiChatModelPresets } from "@codemation/core-nodes";

/**
 * Regression fixture for Sprint 13 Story G UI bugs:
 * - Bug 1: hydration mismatch on canvas mount (canvas vs loading placeholder)
 * - Bug 3: MCP attachment node not visible/selectable on canvas
 *
 * Uses a CronTrigger (icon: "lucide:clock") to also trigger Bug 2 (clock.svg 404).
 * The workflow is NOT expected to run successfully — it exists purely so the
 * canvas renders with an AIAgent node that has an MCP attachment.
 */
export default createWorkflowBuilder({
  id: "wf.e2e.agent-mcp",
  name: "E2E Agent MCP Regression",
})
  .trigger(new CronTrigger("Every minute", { schedule: "* * * * *", timezone: "UTC" }))
  .then(
    new AIAgent({
      name: "MCP Agent",
      messages: [{ role: "user", content: "Test." }],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      mcpServers: ["gmail"],
      guardrails: { maxTurns: 1 },
    }),
  )
  .build();
