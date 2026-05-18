---
"@codemation/core-nodes-ocr": patch
"@codemation/examples": patch
---

Fix zod version mismatch between `@codemation/core-nodes-ocr` and the rest of the monorepo.

The OCR package previously resolved to zod `4.4.1` while all other packages used `4.3.6`, causing a dual-type-identity problem: `DefinedNodeConfigInput` from the two zod builds were structurally incompatible, requiring a `as unknown as RunnableNodeConfig<...>` cast in `node-azure-ocr.example.ts`.

Fix: added `pnpm.overrides: { "zod": "4.3.6" }` to root `package.json` to force a single zod version across all workspace packages. Cast workaround in the OCR example removed.
