---
"@codemation/cli": patch
"@codemation/next-host": patch
---

Fix `/api/lucide-icon/*` 404s in `codemation dev` mode. The CLI dev gateway used to route every `/api/*` request to the disposable Hono runtime, but the lucide icon route lives in next-host's app router only. Added a gateway exception that forwards `/api/lucide-icon/*` to the Next UI proxy in dev. Also added `outputFileTracingIncludes` for `lucide-static` so the same route works in standalone production builds where Next.js's static tracer couldn't see the dynamic `createRequire` load.
