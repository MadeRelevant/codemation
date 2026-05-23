---
"@codemation/core": minor
"@codemation/host": minor
---

Add `McpServerDeclaration` type and `McpServerCatalog` service (Story 7).

- `@codemation/core` exports `McpServerDeclaration` and `McpServerTransport` from `packages/core/src/contracts/mcpTypes.ts`.
- `CodemationPlugin` gains an optional `mcpServers?: ReadonlyArray<McpServerDeclaration>` field.
- `CodemationConfig` gains an optional `mcpServers?: ReadonlyArray<McpServerDeclaration>` field (also threaded through `AppConfig` and `DefineCodemationAppOptions`).
- `McpServerCatalog` in `packages/host/src/mcp/` merges declarations from three sources (`plugin`, `config`, `controlPlane`) with deterministic precedence and validation (id regex, stdio gate, credential requirements).
- `CodemationPluginDiscovery.isPluginConfig` now recognises `mcpServers`-only plugins.
- Plugin registrar and app container factory wire catalog merge on startup.
