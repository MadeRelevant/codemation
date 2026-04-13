---
"@codemation/core": minor
"@codemation/host": minor
"@codemation/core-nodes-gmail": minor
"create-codemation": patch
---

Harden the Gmail plugin so it imports reliably from the package root, returns an authenticated official Gmail session, and supports trigger/read/send/reply/label workflows with one OAuth credential.

Add framework support for OAuth scope presets and custom per-credential scope replacement, and update the plugin starter/docs so future plugins scaffold the same publishable root-entrypoint conventions.
