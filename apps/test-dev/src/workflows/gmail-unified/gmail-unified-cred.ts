import { AIAgent, createWorkflowBuilder } from "@codemation/core-nodes";
import { OnNewGmailTrigger } from "@codemation/core-nodes-gmail";

import { openAiChatModelPresets } from "../../lib/openAiChatModelPresets";

/**
 * Unified-credential validation workflow (Sprint 17 Phase 3).
 *
 * Goal: verify that ONE oauth.google.gmail credential instance satisfies BOTH
 *   1. The GmailTrigger node's "auth" slot (acceptedTypes: ["oauth.google.gmail"])
 *   2. The Gmail MCP server's "credential" connection-node slot (acceptedCredentialTypes: ["oauth.google.gmail"])
 *
 * Canvas will show two credential slots, both accepting oauth.google.gmail.
 * After creating a single oauth.google.gmail credential instance, both dropdowns
 * should list that instance — bind the same instance to each and activate.
 *
 * NOTE: At activation time the MCP credential slot binding flows through
 * AgentMcpIntegrationImpl.autoResolveCredential, which still requires an
 * oauthAppKey on the McpServerDeclaration (broker-era mechanism, TODO story 5.3).
 * The new Gmail MCP declaration has no oauthAppKey, so the agent step will throw
 * AgentBindError at runtime until story 5.3 replaces shorthand resolution with
 * acceptedCredentialTypes-based lookup from the credential binding store.
 * The canvas-level slot display is the validation target for this story.
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
