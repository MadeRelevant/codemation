---
"@codemation/core": patch
---

fix: compile `./browser` and `./contracts` subpath exports (were shipping raw .ts, broke Turbopack consumers)

The `./browser` and `./contracts` subpaths in `@codemation/core` were pointing at raw TypeScript source files (`./src/browser.ts`, `./src/contracts.ts`). Turbopack (used by Next.js) and other browser bundlers refuse to process raw `.ts` from published npm packages, causing builds to fail with "Unknown module type" errors.

Both entry points are now compiled by tsdown and the exports map points at `./dist/browser.{js,cjs,d.ts}` and `./dist/contracts.{js,cjs,d.ts}`. A `development` condition retains the direct-source path for framework-author mode. API surface is unchanged.
