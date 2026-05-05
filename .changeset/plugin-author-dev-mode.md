---
"@codemation/core-nodes-gmail": patch
"@codemation/core-nodes-msgraph": patch
---

Plugin-author `pnpm dev` mode. Each plugin package now ships a `dev` script that builds the framework once via `turbo run build --filter='@codemation/next-host'` (Turbo caches subsequent runs) and then starts `codemation dev:plugin --plugin-root .` against the plugin's `codemation.plugin.ts`. No watchers on the framework. The previous `tsdown --watch` script is preserved as `dev:watch-bundle` for the rare case a downstream consumer needs the plugin's `dist/` rebuilt on save.

Documented in `docs/development-modes.md` as "Plugin author mode". Recommended path for single-plugin work; `apps/plugin-dev` remains for cross-plugin scenarios.
