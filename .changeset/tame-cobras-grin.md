---
"@codemation/host": minor
"@codemation/next-host": minor
"@codemation/cli": patch
"create-codemation": patch
---

Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.
