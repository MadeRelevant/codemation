---
"@codemation/core": minor
"@codemation/host": minor
"@codemation/next-host": patch
"@codemation/core-nodes-msgraph": patch
---

OAuth2 plugin authors can now declare `authorizeUrl` / `tokenUrl` (with `{publicFieldKey}` template substitution) directly on a credential type's `auth` definition — no core change required to add a new provider. Migrated `@codemation/core-nodes-msgraph` to use this for Microsoft tenant-templated URLs (fixes "Unsupported OAuth2 provider id: microsoft" on connect).

Removed dead `@codemation/core-nodes-gmail` devDep from `@codemation/host` and the matching `serverExternalPackages` entry from `@codemation/next-host` so plugin-author `pnpm dev` no longer rebuilds gmail when working on an unrelated plugin.

Softened the credentials UI's "Not set in host env: …" message: it's now an informational tip with neutral styling (was destructive/error styling), since the field works perfectly fine when filled in manually.
