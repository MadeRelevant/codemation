import { AIAgent, createWorkflowBuilder } from "@codemation/core-nodes";
import { OnNewGmailTrigger } from "@codemation/core-nodes-gmail";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Unified-credential validation workflow (Sprint 17 Phase 3 + 5.3).
 *
 * Goal: verify that ONE oauth.google.gmail credential instance satisfies BOTH
 *   1. The GmailTrigger node's "auth" slot (acceptedTypes: ["oauth.google.gmail"])
 *   2. The Gmail MCP server's "credential" connection-node slot (acceptedCredentialTypes: ["oauth.google.gmail"])
 *
 * Canvas will show two credential slots, both accepting oauth.google.gmail.
 * After creating a single oauth.google.gmail credential instance, both dropdowns
 * should list that instance — bind the same instance to each and activate.
 *
 * EXPLICIT BINDING REQUIRED (Story 5.3):
 * The shorthand mcpServers: ["gmail"] form has been removed. Explicit binding is now required:
 *   mcpServers: { gmail: { credential: "<instanceId>" } }
 *
 * The placeholder value "<bind-via-ui>" below will cause an AgentBindError at runtime until
 * you replace it with a real credential instance ID (or bind it via the UI credential
 * binding flow). This matches how trigger credentials work today — the workflow definition
 * describes the shape; the instance is bound before activation.
 */
export default createWorkflowBuilder({
  id: "wf.test-dev.gmail-unified-cred",
  name: "Gmail unified credential — canvas validation",
})
  .trigger(
    new OnNewGmailTrigger("On new Gmail", {
      mailbox: "me",
      labelIds: ["INBOX"],
    }),
  )
  .then(
    new AIAgent({
      name: "Summarise email via Gmail MCP",
      messages: [
        {
          role: "system",
          content: "You have access to Gmail tools. List recent emails.",
        },
        {
          role: "user",
          content: "List recent emails.",
        },
      ],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      // Explicit binding required: replace "<bind-via-ui>" with a real credential instance ID,
      // or bind via the UI credential dropdown before activation.
      mcpServers: { gmail: { credential: "<bind-via-ui>" } },
      guardrails: { maxTurns: 3 },
    }),
  )
  .build();
