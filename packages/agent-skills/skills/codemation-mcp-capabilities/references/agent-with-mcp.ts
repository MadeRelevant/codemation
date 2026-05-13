/**
 * Reference: using an MCP server in a workflow agent node.
 *
 * Before writing this, call GET /api/registry/capabilities?query=<name> to confirm
 * the server id and credential kind. Then use the id here.
 */

import { workflow, agent } from "@codemation/core";
import { CronTrigger } from "@codemation/core-nodes";

// Example: cron-triggered agent that uses the Gmail MCP server.
// The "gmail" id comes from the registry (credentialKind: "oauth2-via-broker").
// The user must have connected their Google account via the concierge before this runs.

export const summariseEmailsWorkflow = workflow("summarise-emails")
  .name("Summarise unread emails")
  .trigger(new CronTrigger("0 9 * * 1-5")) // weekdays at 09:00
  .node(
    "Summarise",
    agent({
      // Shorthand: resolves to the single Gmail credential instance on this workspace.
      // Use explicit binding if multiple Gmail accounts exist:
      //   mcpServers: { gmail: { credential: "chris-work-gmail" } }
      mcpServers: ["gmail"],
      systemPrompt: `
        You are an email assistant. Read the user's unread Gmail messages from the last 24 hours.
        Summarise each one in one sentence. Output as a bullet list.
        Do not draft or send any replies.
      `,
    }),
  )
  .build();
