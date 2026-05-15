/**
 * Reference: using an MCP server in a workflow agent node.
 *
 * Before writing this, call GET /api/registry/capabilities?query=<name> to confirm
 * the server id and credential kind. Then use the id here.
 *
 * Cron / webhook workflows use createWorkflowBuilder({id, name}).trigger(new XxxTrigger(...))
 * and chain with .then(new SomeNodeConfig(...)). The fluent .map/.if/.agent helpers are
 * only available via workflow("id").manualTrigger(...). See codemation-workflow-dsl skill.
 */

import { AIAgent, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

// Example: cron-triggered agent that uses the Gmail MCP server.
// The "gmail" id comes from the registry (credentialKind: "oauth2-via-broker").
// The user must have connected their Google account via the concierge before this runs.

export const summariseEmailsWorkflow = createWorkflowBuilder({
  id: "wf.summarise-emails",
  name: "Summarise unread emails",
})
  .trigger(new CronTrigger("Weekdays at 09:00", { schedule: "0 9 * * 1-5", timezone: "UTC" }))
  .then(
    new AIAgent({
      name: "Summarise",
      // Shorthand: resolves to the single Gmail credential instance on this workspace.
      // Use explicit binding if multiple Gmail accounts exist:
      //   mcpServers: { gmail: { credential: "chris-work-gmail" } }
      mcpServers: ["gmail"],
      messages: [
        {
          role: "system",
          content: [
            "You are an email assistant. Read the user's unread Gmail messages from the last 24 hours.",
            "Summarise each one in one sentence. Output as a bullet list.",
            "Do not draft or send any replies.",
          ].join("\n"),
        },
      ],
    }),
  )
  .build();
