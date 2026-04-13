---
"@codemation/core-nodes-gmail": patch
---

Fix the package root entrypoint smoke tests so they build `@codemation/core` and this package from a clean checkout before verifying published `dist` files and consumer imports (the Gmail bundle loads core at runtime).
