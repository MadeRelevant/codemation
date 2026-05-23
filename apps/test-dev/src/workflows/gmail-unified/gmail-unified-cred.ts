import { AIAgent, createWorkflowBuilder } from "@codemation/core-nodes";
import { OnNewGmailTrigger } from "@codemation/core-nodes-gmail";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Unified-credential validation workflow.
 *
 * Goal: verify that ONE oauth.google.gmail credential instance satisfies BOTH
 *   1. The GmailTrigger node's "auth" slot (acceptedTypes: ["oauth.google.gmail"])
 *   2. The Gmail MCP server slot on the agent (acceptedCredentialTypes: ["oauth.google.gmail"])
 *
 * Canvas will show two credential slots, both accepting oauth.google.gmail. After creating a
 * single oauth.google.gmail credential instance, both dropdowns should list that instance —
 * bind the same instance to each and activate.
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
      mcpServers: ["gmail"],
      guardrails: { maxTurns: 3 },
    }),
  )
  .build();
