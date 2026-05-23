---
"@codemation/next-host": patch
---

fix(next-host): use stable lucide-static path resolution

Replace bare `require.resolve` with `createRequire(fileURLToPath(import.meta.url)).resolve` so
the lucide icons directory resolves correctly in Next.js ESM API routes and standalone builds.
