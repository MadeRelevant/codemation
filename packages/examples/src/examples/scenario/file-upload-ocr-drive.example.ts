/**
 * @description HTTP webhook receives a binary file upload → reads binary via ctx.binary →
 * posts the result as text to an external API (simulating a Drive upload).
 * Substitution: no FileUploadTrigger or native Google Drive node exists. Binary payloads
 * always flow through ctx.binary — never as base64 on item.json.
 * The Azure OCR analyzeDocumentNode (from @codemation/core-nodes-ocr) processes documents
 * read from ctx.binary["data"]; see the package README for the full OCR pattern.
 * @tags binary, ocr, drive, upload, webhook, file, stream, http, document, attachment, style:scenario
 * @uses @codemation/core-nodes, node:WebhookTrigger, node:Callback, node:HttpRequest
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, Callback, HttpRequest, WebhookTrigger } from "@codemation/core-nodes";

type UploadMeta = Readonly<{
  filename: string;
  mimeType: string;
}>;

type ExtractedText = Readonly<{
  filename: string;
  textLength: number;
  preview: string;
}>;

export default createWorkflowBuilder({
  id: "example.file-upload-ocr-drive",
  name: "File upload → read binary → upload result",
})
  .trigger(
    // The caller POSTs JSON metadata + attaches file bytes to ctx.binary["data"] via
    // the webhook handler's multipart/binary processing middleware.
    new WebhookTrigger("Receive file upload", {
      endpointKey: "file-upload-ocr",
      methods: ["POST"],
    }),
  )
  .then(
    // Read the binary attachment and extract its text content.
    // In a real workflow, replace this Callback with analyzeDocumentNode from @codemation/core-nodes-ocr.
    new Callback<UploadMeta, ExtractedText>("Read binary attachment", async (items, ctx) =>
      Promise.all(
        items.map(async (item) => {
          const attachment = item.binary?.["data"];
          if (!attachment) throw new Error('No binary attachment at slot "data"');

          // ctx.binary.openReadStream() returns { body: ReadableStream<Uint8Array>, size? }.
          const result = await ctx.binary.openReadStream(attachment);
          if (!result) throw new Error("Failed to open binary stream");
          // Read all bytes from the web ReadableStream.
          const reader = result.body.getReader();
          const chunks: Uint8Array[] = [];
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          const text = new TextDecoder().decode(merged);
          return {
            ...item,
            json: {
              filename: (item.json as UploadMeta).filename ?? "upload",
              textLength: text.length,
              preview: text.slice(0, 200),
            },
          };
        }),
      ),
    ),
  )
  .then(
    // Upload the extracted text to an external API (substitute with a Drive node when available).
    // Bind the "drive-bearer" slot to a Bearer Token credential holding an OAuth access token.
    new HttpRequest("Upload to Drive API", {
      method: "POST",
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      credentialSlot: "drive-bearer",
      headers: { "Content-Type": "application/json" },
      body: {
        kind: "json",
        data: JSON.stringify({ name: "extracted-text.txt" }),
      },
    }),
  )
  .build();
