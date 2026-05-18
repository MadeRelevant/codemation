---
"@codemation/examples": minor
---

Sprint 12 Story B: Coverage audit + custom-pattern examples.

Adds six new examples closing per-node coverage gaps and introducing discoverable `defineRestNode`/`defineNode` templates for the agent's fallback chain:

- `node-collection-crud.example.ts` — all six collection CRUD nodes (insert, get, findOne, list, update, delete)
- `node-modifygmaillabels.example.ts` — ModifyGmailLabels node
- `node-azure-ocr.example.ts` — all three Azure OCR nodes (analyzeDocumentNode, analyzeImageNode, analyzeInvoiceNode)
- `custom-rest-node-simple.example.ts` — minimal `defineRestNode` with a public endpoint, no credential
- `custom-rest-node-with-credential.example.ts` — `defineRestNode` with bearer-token credential slot
- `custom-node-template.example.ts` — `defineNode` per-item execute() escape hatch

Also adds `@codemation/core-nodes-ocr` as a dependency and updates `AUTHORING.md` with a "When to write a custom-pattern example" section.
