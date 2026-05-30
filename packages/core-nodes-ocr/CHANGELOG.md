# @codemation/core-nodes-ocr

## 0.2.3

### Patch Changes

- Updated dependencies [[`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6)]:
  - @codemation/core@0.12.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`e0933eb`](https://github.com/MadeRelevant/codemation/commit/e0933ebc51806a9593f94758860c591b8346a7a5)]:
  - @codemation/core@0.11.1

## 0.2.0

### Minor Changes

- 8285ec0: feat(core-nodes-ocr): new package — Azure AI Content Understanding OCR nodes

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

### Patch Changes

- 8285ec0: Fix zod version mismatch between `@codemation/core-nodes-ocr` and the rest of the monorepo.

  The OCR package previously resolved to zod `4.4.1` while all other packages used `4.3.6`, causing a dual-type-identity problem: `DefinedNodeConfigInput` from the two zod builds were structurally incompatible, requiring a `as unknown as RunnableNodeConfig<...>` cast in `node-azure-ocr.example.ts`.

  Fix: added `pnpm.overrides: { "zod": "4.3.6" }` to root `package.json` to force a single zod version across all workspace packages. Cast workaround in the OCR example removed.

- 8285ec0: Add `build:metadata` script to curated packages — emits `dist/metadata.json` at build time for the Sprint 10 agent capability discovery catalog.
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [7b50018]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [0082ab5]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
  - @codemation/core@0.11.0

## 0.1.0

### Minor Changes

- Initial release: Azure AI Content Understanding OCR nodes (`analyzeInvoiceNode`, `analyzeDocumentNode`, `analyzeImageNode`) with a shared credential type.
