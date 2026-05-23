---
"@codemation/host": minor
---

`CredentialTypeRegistry` now accepts named sources with priority shadowing (parity with `McpServerCatalog`). Sources are ordered `plugin` < `config` < `controlPlane`; higher-priority sources shadow lower ones, lower-priority duplicates are ignored, and both cases log a warn.

`applyControlPlaneOverrides` is removed. Control-plane payload now flows through `mergeDefinitions("controlPlane", …)` and can add new types — not just override existing ones. Plugins/config use `merge(source, types)` for full credential types.

`McpRegistryFetcher` is removed; `ControlPlaneCatalogFetcher` is the single control-plane catalog poller and now merges credential-type definitions in addition to MCP server declarations and OAuth app catalog entries.
