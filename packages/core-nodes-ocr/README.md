# `@codemation/core-nodes-ocr`

Azure AI Content Understanding OCR integration for Codemation. Exposes three prebuilt analyzer nodes for document, invoice, and image analysis — designed to make it trivial to wire up OCR-powered workflows.

## Install

```bash
pnpm add @codemation/core-nodes-ocr
```

## Nodes

- `analyzeInvoiceNode` — runs the `prebuilt-invoice` analyzer; returns markdown + structured fields. The `prebuilt-invoice` ID is verified against the Azure SDK.
- `analyzeDocumentNode` — runs the `prebuilt-document` analyzer by default; accepts a custom `analyzerId`. The default ID follows Azure's published naming conventions but is not verified against a live resource — pass your own `analyzerId` if Azure returns "analyzer not found."
- `analyzeImageNode` — runs the `prebuilt-imageAnalyzer` by default; accepts a custom `analyzerId`. Same caveat as `analyzeDocumentNode`.

All three nodes read their input from `item.binary` (default key: `"data"`) and emit `{ content: string; fields: Record<string, unknown> }` as the item payload. Binary bytes are never put in `item.json`.

## Credential

Register an `azureContentUnderstandingCredentialType` credential with:

- **Endpoint** (public) — your Azure resource endpoint, e.g. `https://your-resource.cognitiveservices.azure.com/`
- **API key** (secret)

## Usage

```ts
import { analyzeInvoiceNode, azureContentUnderstandingCredentialType } from "@codemation/core-nodes-ocr";

// Wire up in your workflow:
workflow
  // assume a binary PDF is attached as item.binary["data"]
  .then(analyzeInvoiceNode.create({ binaryField: "data" }, "Extract invoice fields"));
```

The output item's `json` will contain:

```ts
{
  content: "# Invoice\n\n...",   // markdown text from the analyzer
  fields: {                      // structured fields (dates, amounts, line items, etc.)
    VendorName: "Acme Corp",
    InvoiceTotal: 1234.56,
    // ...
  }
}
```

For custom analyzer IDs (e.g. a fine-tuned model), pass `analyzerId`:

```ts
analyzeDocumentNode.create({ analyzerId: "my-custom-model", binaryField: "doc" }, "Analyze contract");
```

## Output shape

All three nodes return the same `OcrAnalysisOutput` type:

```ts
type OcrAnalysisOutput = {
  content: string; // markdown representation of the document
  fields: Record<string, unknown>; // structured fields from the prebuilt model
};
```

Multi-page results are merged into a single `content` string; the `fields` property reflects the primary or first content segment unless the analyzer returns multiple segments (in which case a `segments` array is included).
