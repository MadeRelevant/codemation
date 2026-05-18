/**
 * @description Webhook receives a binary file upload → analyzeDocumentNode extracts text and
 * structured fields from the document using Azure Content Understanding. All three OCR nodes
 * (analyzeDocumentNode, analyzeImageNode, analyzeInvoiceNode) share the same pattern: binary
 * in via item.binary[binaryField], Azure credential on "contentUnderstanding", markdown + fields out.
 * See inline comments for the analyzeImageNode and analyzeInvoiceNode equivalents.
 * @tags ocr, azure, document, image, invoice, binary, extract, text, scan, content-understanding, style:node
 * @uses @codemation/core-nodes-ocr, credential:azure-content-understanding, node:analyzeDocumentNode, node:analyzeImageNode, node:analyzeInvoiceNode
 * @dependencies @codemation/core-nodes@workspace:*, @codemation/core-nodes-ocr@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, WebhookTrigger } from "@codemation/core-nodes";
import type { RunnableNodeConfig } from "@codemation/core";
import {
  analyzeDocumentNode,
  // Swap analyzeDocumentNode for either of these to target different content types:
  //   analyzeImageNode  — same config shape; defaults to the prebuilt-imageAnalyzer
  //   analyzeInvoiceNode — same config shape; always uses the prebuilt-invoice analyzer
  //                        (no analyzerId override — the prebuilt is the only supported variant)
} from "@codemation/core-nodes-ocr";

/** Output shape returned by all three Azure OCR nodes (document, image, invoice). */
type OcrOutput = Readonly<{
  content: string;
  fields: Readonly<Record<string, unknown>>;
}>;

// Binary payloads always flow through ctx.binary — never as base64 on item.json.
// The webhook handler attaches the uploaded file bytes to item.binary["data"].
export default createWorkflowBuilder({
  id: "example.node-azure-ocr",
  name: "Azure OCR: analyze document binary attachment",
})
  .trigger(
    // The caller POSTs a binary file; the framework places the bytes at item.binary["data"].
    new WebhookTrigger("Receive document upload", {
      endpointKey: "ocr-document-upload",
      methods: ["POST"],
    }),
  )
  // analyzeDocumentNode reads item.binary["data"] (configurable via binaryField).
  // Returns { content: string, fields: Record<string, unknown> }.
  // The "contentUnderstanding" credential slot must be bound to an Azure credential before activation.
  //
  // To analyze an image: replace analyzeDocumentNode with analyzeImageNode (same config shape).
  // To analyze an invoice: replace with analyzeInvoiceNode (omit analyzerId — it's fixed to prebuilt-invoice).
  //
  // Note: cast is required because @codemation/core-nodes-ocr resolves a newer zod minor than
  // the workspace pin (4.3.6). The runtime behaviour is identical; the cast is type-system bookkeeping.
  .then(
    analyzeDocumentNode.create(
      {
        // Which key on item.binary holds the document bytes. Default is "data".
        binaryField: "data",
        // Override the analyzer ID to use a custom trained model (leave undefined for the default prebuilt-document).
        analyzerId: undefined,
        // Override MIME type sent to Azure (leave undefined to use the attachment's own mimeType).
        contentType: undefined,
        // Cap file size before reading (leave undefined for the default 50 MiB limit).
        maxBytes: undefined,
      },
      "Analyze document",
      "analyze-document",
    ) as unknown as RunnableNodeConfig<unknown, OcrOutput>,
  )
  .build();
