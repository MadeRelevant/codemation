import { AIAgent, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Sprint 2 Story 15 — End-to-end smoke: cron → agent → Gmail MCP
 *
 * Fires every 60 seconds. The agent connects to the Gmail MCP server declared in the
 * control-plane registry (source: "controlPlane", D6 in mcp-design.md) — no plugin
 * package is imported. It lists the 3 most recent unread emails and logs each as an item.
 *
 * Prerequisites (see README.md in this directory):
 *  - Control-plane installation paired (WORKSPACE_PAIRING_SECRET set)
 *  - Gmail OAuthApp row seeded in CP, GMAIL_MCP_URL set to a real MCP server URL
 *  - A CredentialInstance for "google-mail" OAuth connected via the concierge broker
 *
 * At runtime:
 *  - If no unread messages: agent emits zero items → workflow halts for this tick (expected)
 *  - If credential lacks required scopes: NeedsReconsentEvent is emitted, workflow does not crash
 */
export default createWorkflowBuilder({
  id: "wf.sprint2.gmail-agent-smoke",
  name: "Sprint 2 smoke: cron → agent → Gmail MCP",
})
  .trigger(new CronTrigger("Every minute", { schedule: "* * * * *", timezone: "UTC" }))
  .then(
    new AIAgent({
      name: "Gmail reader",
      messages: [
        {
          role: "system",
          content:
            "You are a workflow assistant with access to Gmail tools. " +
            "List the 3 most recent unread emails in the inbox. " +
            "For each email output a JSON item with fields: subject, from, snippet. " +
            "If there are no unread emails, output nothing (return an empty response).",
        },
        {
          role: "user",
          content: "Check for unread emails now.",
        },
      ],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      mcpServers: ["gmail"],
      guardrails: { maxTurns: 5 },
    }),
  )
  .build();
