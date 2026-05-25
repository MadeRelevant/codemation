# @codemation/examples

## 0.2.1

### Patch Changes

- Updated dependencies [[`e0933eb`](https://github.com/MadeRelevant/codemation/commit/e0933ebc51806a9593f94758860c591b8346a7a5), [`a70e182`](https://github.com/MadeRelevant/codemation/commit/a70e182a852026e4f6d8f317fe9862417dc23ce6), [`5315e23`](https://github.com/MadeRelevant/codemation/commit/5315e2361492560601ac2c97491aa58c49346fd4), [`ac860a5`](https://github.com/MadeRelevant/codemation/commit/ac860a5af1df3e5766581e644fef8cc0d1b24eba), [`8ac207a`](https://github.com/MadeRelevant/codemation/commit/8ac207ab263542e46fad0b9e1ea584fbb71a747c), [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea)]:
  - @codemation/core@0.11.1
  - @codemation/host@0.8.0
  - @codemation/core-nodes@0.8.1
  - @codemation/core-nodes-gmail@0.3.1
  - @codemation/core-nodes-ocr@0.2.2

## 0.2.0

### Minor Changes

- 8285ec0: feat(examples): add @codemation/examples workspace package with dev harness, frontmatter convention, verify-examples CI gate, and codemation example:verify CLI command (Sprint 10 Story B)
- 8285ec0: Seed @codemation/examples with 10 curated example workflows covering the most common patterns:
  webhook-to-db, cron-api-poll, gmail-summarize, file-upload-ocr-drive, if-branch, switch-cases,
  llm-pipeline, map-fanout-fanin, pinned-output-dev-loop, and activate-with-credentials.
  All examples typecheck, lint, and pass verify-examples. AUTHORING.md updated with "What good looks like" guidance.
- 8285ec0: Add per-node example coverage for all core nodes (Sprint 11 Story B).

  New examples in `packages/examples/src/examples/`:
  - `node-aiagent` — AIAgent with managed gateway + Zod outputSchema
  - `node-httprequest` — GET + POST patterns with response metadata
  - `node-filter` — predicate-based item filtering
  - `node-mapdata` — field rename + derived values across two MapData steps
  - `node-split` — array fan-out per element
  - `node-aggregate` — reduce batch to single summary item
  - `node-merge` — recombine If branches with append mode
  - `node-wait` — fixed-duration pause for rate limiting
  - `node-callback` — async side-effect handler with Items batch
  - `node-istestrun` — guard live notifications in test mode
  - `node-testtrigger-assertion` — TestTrigger + Assertion workflow testing primitive
  - `node-subworkflow` — invoke reusable workflow by id per item
  - `node-noop` — explicit sink/placeholder in branch
  - `node-crontrigger` — hourly scheduled polling
  - `node-webhooktrigger` — inbound HTTP with Zod inputSchema validation

  Updates `packages/examples/docs/AUTHORING.md` with a "Node-focused vs scenario examples" section
  explaining when to write each style.

- 8285ec0: Sprint 12 Story B: Coverage audit + custom-pattern examples.

  Adds six new examples closing per-node coverage gaps and introducing discoverable `defineRestNode`/`defineNode` templates for the agent's fallback chain:
  - `node-collection-crud.example.ts` — all six collection CRUD nodes (insert, get, findOne, list, update, delete)
  - `node-modifygmaillabels.example.ts` — ModifyGmailLabels node
  - `node-azure-ocr.example.ts` — all three Azure OCR nodes (analyzeDocumentNode, analyzeImageNode, analyzeInvoiceNode)
  - `custom-rest-node-simple.example.ts` — minimal `defineRestNode` with a public endpoint, no credential
  - `custom-rest-node-with-credential.example.ts` — `defineRestNode` with bearer-token credential slot
  - `custom-node-template.example.ts` — `defineNode` per-item execute() escape hatch

  Also adds `@codemation/core-nodes-ocr` as a dependency and updates `AUTHORING.md` with a "When to write a custom-pattern example" section.

- 8285ec0: Reorganise examples package by kind (node/, scenario/, custom-pattern/) and extend HttpRequest credential API.

  **`@codemation/core-nodes`**: `HttpRequest.credentialSlot` now accepts an object form `{ name: string; acceptedTypes?: ReadonlyArray<AnyCredentialType> }` in addition to the string shorthand. The object form narrows the credential types shown in the UI to the specified list. The string shorthand and the default four accepted types are fully backward-compatible.

  **`@codemation/examples`**: Examples moved from the flat `src/examples/` directory into three subdirectories — `node/` (single-node focus), `scenario/` (multi-node use cases), and `custom-pattern/` (`defineRestNode`/`defineNode` templates). Discovery, verification, and metadata extraction are all updated to walk subdirectories recursively. New examples added: `node-httprequest-with-credential` (demonstrates the new `credentialSlot` object form) and `node-aiagent-with-tools` (demonstrates `AIAgent` with inline `callableTool` for tool-calling scenarios).

### Patch Changes

- 8285ec0: Fix `@codemation/examples` tsconfig to resolve `@codemation/host` and `@codemation/host/authoring` from source (`src/index.ts`, `src/authoring.ts`) instead of the dist bundle (`dist/index.d.ts`, `dist/authoring.d.ts`).

  The previous dist-based path override caused a dual-module type identity problem: types like `DefinedNodeConfigInput` exported by `host` were bundled into `dist/index-*.d.ts` with a different module identity than the same type from `core/src`, making the two structurally incompatible for TypeScript assignability checks.

  Note: `.node()` DSL chaining with nodes whose `configSchema` uses `z.record(z.string(), z.unknown())` (e.g. `collectionInsertNode`) still hits a TypeScript inference limitation where the config generic cannot be narrowed from the literal. Workaround: use `.then(node.create({...}, name, id))` directly. This is tracked for a future fix.

- 8285ec0: Fix zod version mismatch between `@codemation/core-nodes-ocr` and the rest of the monorepo.

  The OCR package previously resolved to zod `4.4.1` while all other packages used `4.3.6`, causing a dual-type-identity problem: `DefinedNodeConfigInput` from the two zod builds were structurally incompatible, requiring a `as unknown as RunnableNodeConfig<...>` cast in `node-azure-ocr.example.ts`.

  Fix: added `pnpm.overrides: { "zod": "4.3.6" }` to root `package.json` to force a single zod version across all workspace packages. Cast workaround in the OCR example removed.

- 8285ec0: Sprint 11 E — tagging discipline doc + backfill.

  Adds `packages/examples/docs/TAGGING.md`: BM25 tag guidance covering tag categories (capability, pattern, vertical, style), 5 concrete good-vs-bad pairs, the "would the agent's query hit this?" test, and BM25 mechanics. Cross-links from AUTHORING.md.

  Backfill: all 10 Sprint 10 C scenario examples gain `style:scenario` + expanded tag sets (was 3 thin generic tags, now 9-11 covering capability, alternates, pattern, domain). Five Sprint 11 B node examples with fewer than 5 substantive tags expanded with synonyms and domain terms. All 25 examples now exceed the 3-tag minimum bar.

- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
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
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
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
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [f344d6d]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [51b728d]
  - @codemation/host@0.7.0
  - @codemation/core-nodes@0.8.0
  - @codemation/core@0.11.0
  - @codemation/core-nodes-ocr@0.2.0
  - @codemation/core-nodes-gmail@0.3.0
