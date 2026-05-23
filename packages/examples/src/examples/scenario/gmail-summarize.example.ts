/**
 * @description Gmail trigger (new email matching a label) → LLM summarize → reply with the summary.
 * @tags email, gmail, trigger, auto-reply, notification, llm, aiagent, summarize, reply, style:scenario
 * @uses @codemation/core-nodes-gmail, credential:gmail, node:OnNewGmailTrigger, node:ReplyToGmailMessage
 * @dependencies @codemation/core-nodes@workspace:*, @codemation/core-nodes-gmail@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, AIAgent, CodemationChatModelConfig, MapData } from "@codemation/core-nodes";
import { OnNewGmailTrigger, ReplyToGmailMessage } from "@codemation/core-nodes-gmail";
import type { OnNewGmailTriggerItemJson, ReplyToGmailMessageInputJson } from "@codemation/core-nodes-gmail";
import { z } from "zod";

export default createWorkflowBuilder({ id: "example.gmail-summarize", name: "Gmail: auto-summarize + reply" })
  .trigger(
    new OnNewGmailTrigger("New email", {
      mailbox: "me",
      // Only process emails carrying the "to-summarize" label.
      labelIds: ["to-summarize"],
    }),
  )
  .then(
    new AIAgent<OnNewGmailTriggerItemJson, { summary: string }>({
      name: "Summarize email",
      messages: [
        {
          role: "system",
          content: 'Summarize the email below in 2–3 sentences. Respond with strict JSON: {"summary": string}.',
        },
        {
          role: "user",
          content: ({ item }) =>
            `Subject: ${item.json.subject ?? "(no subject)"}\n\n${item.json.textPlain ?? item.json.snippet ?? ""}`,
        },
      ],
      chatModel: new CodemationChatModelConfig("Claude Haiku (managed)", "anthropic/claude-haiku-4-5-20251001"),
      outputSchema: z.object({ summary: z.string() }),
      guardrails: { maxTurns: 2 },
    }),
  )
  // Combine the agent's summary with the original messageId, then map to the reply shape.
  .then(
    new MapData<{ summary: string; messageId?: string }, ReplyToGmailMessageInputJson>(
      "Prepare reply payload",
      (item) => ({
        messageId: (item.json as { messageId?: string }).messageId ?? "",
        text: `Summary:\n\n${(item.json as { summary?: string }).summary ?? ""}`,
      }),
    ),
  )
  .then(
    // ReplyToGmailMessage reads messageId and text from item.json (enforced by inputSchema).
    // The credential slot "auth" must be bound to a Gmail OAuth credential instance.
    new ReplyToGmailMessage("Reply with summary"),
  )
  .build();
