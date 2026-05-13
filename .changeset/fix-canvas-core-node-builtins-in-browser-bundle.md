---
"@codemation/canvas": patch
"@codemation/core": patch
---

Stop leaking `node:crypto` and `node:module` into canvas's browser bundle. `NodeIterationIdFactory` and `ConnectionInvocationIdFactory` now use `globalThis.crypto.randomUUID()` instead of importing `randomUUID` from `node:crypto`. Canvas's `tsdown` build is configured with `platform: "neutral"` so the dist no longer ships `createRequire(import.meta.url)` from `node:module`. Fixes consumer Turbopack OOMs when the canvas dist is included in a Next.js client bundle.
