/**
 * @description Webhook receives a binary file upload → attaches bytes via ctx.binary →
 * SubWorkflow invocation carries the BinaryAttachment reference across the workflow boundary.
 * Demonstrates the metadata-then-execute contract: bytes live in ctx.binary storage; only the
 * BinaryAttachment reference (storageKey, mimeType, size) travels on item.binary — never base64
 * on item.json. SubWorkflow propagates item.binary transparently: the child workflow reads
 * item.binary["data"] just as the parent would.
 * @tags subworkflow binary ctx.binary composition pass-through style:node
 * @uses @codemation/core-nodes, node:SubWorkflow, node:WebhookTrigger, node:Callback
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, Callback, SubWorkflow, WebhookTrigger } from "@codemation/core-nodes";
import type { BinaryAttachment, Item } from "@codemation/core";

// ---- Types -------------------------------------------------------------------

type UploadMeta = Readonly<{
  filename: string;
  mimeType: string;
  sizeBytes: number;
}>;

type ProcessedMeta = Readonly<{
  filename: string;
  mimeType: string;
  sizeBytes: number;
  // BinaryAttachment reference added after attaching via ctx.binary.
  // The child workflow reads item.binary["data"] using this reference.
  attachmentRef: BinaryAttachment;
}>;

// ---- Parent workflow ---------------------------------------------------------
//
// This is the calling workflow. It:
//   1. Receives the raw bytes via a WebhookTrigger.
//   2. Attaches them to the item's binary slot via ctx.binary.attach() (the required contract).
//   3. Calls a SubWorkflow that receives the full item — including item.binary["data"].
//
// The child workflow (id: "example.process-binary-document") is illustrative.
// Replace the id with a real workflow id that is registered in your workspace.
// The SubWorkflow node calls it per item, bypassing its trigger and passing items: [current].
export default createWorkflowBuilder({
  id: "example.subworkflow-binary-passthrough",
  name: "SubWorkflow: pass binary attachment across workflow boundary",
})
  .trigger(
    // Caller POSTs multipart/form-data; the webhook middleware attaches file bytes to
    // ctx.binary["data"] and JSON metadata to item.json automatically for multipart uploads.
    // For this example the WebhookTrigger is the binary source — no separate trigger node needed.
    new WebhookTrigger("Receive file upload", {
      endpointKey: "binary-passthrough",
      methods: ["POST"],
    }),
  )
  .then(
    // Attach the raw bytes from the webhook body to item.binary["data"].
    // ctx.binary.attach() persists bytes in object storage and returns a BinaryAttachment
    // (containing storageKey, mimeType, size, etc.) — only the metadata lives on the item.
    //
    // Rule: never put bytes or base64 on item.json. Use ctx.binary.attach() instead.
    new Callback<UploadMeta, ProcessedMeta>("Attach upload bytes", async (items, ctx) => {
      const results: Item<ProcessedMeta>[] = [];
      for (const item of items) {
        const meta = item.json as UploadMeta;

        // In a real multipart webhook, the bytes arrive pre-attached to item.binary["data"]
        // by the framework's webhook middleware. Here we read them back to re-attach with
        // explicit metadata (demonstrating the full ctx.binary.attach() contract).
        const existing = item.binary?.["data"];
        if (!existing) {
          throw new Error('No binary at slot "data" — ensure the webhook received a file upload.');
        }

        // Re-attach with explicit metadata (mimeType, filename).
        // In practice, skip this if the webhook middleware already attached correctly.
        const stream = await ctx.binary.openReadStream(existing);
        if (!stream) throw new Error("Could not open binary stream for re-attachment.");
        const attachmentRef = await ctx.binary.attach({
          name: "data",
          body: stream.body,
          mimeType: meta.mimeType,
          filename: meta.filename,
        });

        // ctx.binary.withAttachment returns a new Item with item.binary["data"] = attachmentRef.
        // The BinaryAttachment reference (storageKey, not bytes) travels on the item.
        results.push(ctx.binary.withAttachment({ ...item, json: { ...meta, attachmentRef } }, "data", attachmentRef));
      }
      return results;
    }),
  )
  .then(
    // SubWorkflow passes the ENTIRE item — including item.binary["data"] — to the child workflow.
    // The child reads the BinaryAttachment reference from item.binary["data"] and calls
    // ctx.binary.openReadStream(item.binary["data"]) to stream the bytes.
    //
    // Binary does NOT need to be re-attached inside the child — the storageKey is shared.
    // The child workflow's nodes see the same BinaryAttachment reference on item.binary.
    new SubWorkflow<ProcessedMeta, ProcessedMeta>(
      "Process document in sub-workflow",
      "example.process-binary-document", // id of the child workflow — must exist in the workspace
    ),
  )
  .build();
