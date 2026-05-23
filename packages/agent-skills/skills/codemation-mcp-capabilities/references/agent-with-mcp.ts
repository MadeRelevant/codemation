/**
 * Reference: using an MCP server in a workflow agent node.
 *
 * Before writing this, call GET /api/registry/capabilities?query=<name> to confirm
 * the server id and credential type. Then list the server id under `mcpServers`.
 *
 * Cron / webhook workflows use createWorkflowBuilder({id, name}).trigger(new XxxTrigger(...))
 * and chain with .then(new SomeNodeConfig(...)). The fluent .map/.if/.agent helpers are
 * only available via workflow("id").manualTrigger(...). See codemation-workflow-dsl skill.
 *
 * `mcpServers` is a plain array of server ids. Each declared server surfaces a credential
 * slot (`mcp:<serverId>`) on the agent node. The user binds a credential instance via the
 * canvas credential dropdown before activation — same flow as trigger credentials.
 */

import { AIAgent, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

// Example: cron-triggered agent that uses the Gmail MCP server.
// The "gmail" id comes from the registry (acceptedCredentialTypes: ["oauth.google.gmail"]).
// The user must have connected their Google account and bound the credential before this runs.

export const summariseEmailsWorkflow = createWorkflowBuilder({
  id: "wf.summarise-emails",
  name: "Summarise unread emails",
})
  .trigger(new CronTrigger("Weekdays at 09:00", { schedule: "0 9 * * 1-5", timezone: "UTC" }))
  .then(
    new AIAgent({
      name: "Summarise",
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
