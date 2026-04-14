---
"@codemation/core": minor
"@codemation/core-nodes": minor
---

Preserve binaries for runnable node outputs and make workflow authoring APIs accept explicit output behavior options.

This adds `keepBinaries` support across runnable execution paths, updates `MapData` and related workflow authoring helpers to use an options object for node ids and output behavior, and refreshes tests and docs around the new contract.
