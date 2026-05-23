---
"@codemation/canvas": patch
---

Add `aria-hidden` and `react-remove-scroll` as direct dependencies. Canvas's dist references these (transitively pulled in via Radix UI Dialog primitives used by next-host source files that canvas's tsconfig `@/*` path alias cherry-picks). Without these declared, consumers fail with `Module not found` when the canvas dist is bundled into a Next.js client bundle.

This is a tactical fix; the architectural cleanup is to stop canvas's tsconfig from aliasing `@/*` to `../next-host/src/*`. Tracked as a follow-up.
