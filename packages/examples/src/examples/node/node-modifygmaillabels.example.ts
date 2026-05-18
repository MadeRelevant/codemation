/**
 * @description Gmail trigger → classify email subject with LLM → add or remove Gmail labels based on result.
 * Demonstrates ModifyGmailLabels, which can tag either a message or an entire thread by Gmail label ID.
 * @tags gmail, label, modify-labels, organize, categorize, email, trigger, auto-label, classification, style:node
 * @uses @codemation/core-nodes-gmail, credential:gmail, node:OnNewGmailTrigger, node:ModifyGmailLabels
 * @dependencies @codemation/core-nodes@workspace:*, @codemation/core-nodes-gmail@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, MapData } from "@codemation/core-nodes";
import { OnNewGmailTrigger, ModifyGmailLabels } from "@codemation/core-nodes-gmail";
import type { OnNewGmailTriggerItemJson, ModifyGmailLabelsInputJson } from "@codemation/core-nodes-gmail";

// ModifyGmailLabels adds and/or removes labels on a Gmail message or thread.
// Both the OnNewGmailTrigger and ModifyGmailLabels require a Gmail OAuth credential on slot "auth".
export default createWorkflowBuilder({
  id: "example.node-modifygmaillabels",
  name: "ModifyGmailLabels: auto-label incoming email",
})
  .trigger(
    // Fires once per new email. The trigger's credential slot "auth" must be connected.
    new OnNewGmailTrigger("New email", {
      mailbox: "me",
      // Only process emails not yet read.
      labelIds: ["UNREAD"],
    }),
  )
  // Map the trigger item to the shape ModifyGmailLabels expects.
  // Use messageId to target just this message (set target: "thread" to label the whole thread).
  .then(
    new MapData<OnNewGmailTriggerItemJson, ModifyGmailLabelsInputJson>(
      "Prepare label mutation",
      (item) => ({
        target: "message",
        messageId: item.json.messageId,
        // Add the "support" label (use the Gmail label ID, e.g. "Label_123").
        addLabelIds: ["Label_support"],
        // Remove UNREAD so the message doesn't retrigger.
        removeLabelIds: ["UNREAD"],
      }),
      { id: "prepare-label-mutation" },
    ),
  )
  // ModifyGmailLabels reads messageId/threadId and addLabelIds/removeLabelIds from item.json.
  // The "auth" credential slot must be bound to a Gmail OAuth credential before activation.
  .then(new ModifyGmailLabels("Apply label", "apply-label"))
  .build();
