---
"create-codemation": patch
---

Bump scaffolder template dependency ranges to track the current 1.x major: `@codemation/core`, `@codemation/core-nodes`, and `@codemation/host` were pinned to pre-1.0 ranges (`0.0.x` / `0.1.x`), so freshly scaffolded projects pulled in stale pre-1.0 builds whose exports maps lacked `./authoring` etc. Reproduced as `pnpm create codemation foo` → `Package subpath './authoring' is not defined by "exports"`.
