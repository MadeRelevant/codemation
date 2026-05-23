---
"@codemation/examples": patch
---

Fix `@codemation/examples` tsconfig to resolve `@codemation/host` and `@codemation/host/authoring` from source (`src/index.ts`, `src/authoring.ts`) instead of the dist bundle (`dist/index.d.ts`, `dist/authoring.d.ts`).

The previous dist-based path override caused a dual-module type identity problem: types like `DefinedNodeConfigInput` exported by `host` were bundled into `dist/index-*.d.ts` with a different module identity than the same type from `core/src`, making the two structurally incompatible for TypeScript assignability checks.

Note: `.node()` DSL chaining with nodes whose `configSchema` uses `z.record(z.string(), z.unknown())` (e.g. `collectionInsertNode`) still hits a TypeScript inference limitation where the config generic cannot be narrowed from the literal. Workaround: use `.then(node.create({...}, name, id))` directly. This is tracked for a future fix.
