---
"@codemation/core-nodes-ocr": minor
---

feat(core-nodes-ocr): new package — Azure AI Content Understanding OCR nodes

Adds `@codemation/core-nodes-ocr`, a built-in node package exposing three prebuilt Azure AI
Content Understanding analyzer nodes for use in Codemation workflows:

- `analyzeInvoiceNode` — runs the `prebuilt-invoice` analyzer; returns markdown content and
  structured invoice fields (vendor, totals, line items, dates, etc.).
- `analyzeDocumentNode` — runs the `prebuilt-document` analyzer by default; accepts a custom
  `analyzerId` config field for fine-tuned or custom models.
- `analyzeImageNode` — runs the `prebuilt-imageAnalyzer` by default; same `analyzerId` escape
  hatch as the document node.

All nodes read binary input from `item.binary` via `ctx.binary.openReadStream` (default key:
`"data"`), emit `{ content: string; fields: Record<string, unknown> }` as the downstream payload,
and implement `inspectorSummary()` for the workflow inspector panel. The package ships a single
`azureContentUnderstandingCredentialType` (endpoint + API key) shared across all three nodes,
and includes a `codemation.plugin.ts` entry for plugin discovery.
