---
name: codemation-plugin-development
description: Guides Codemation plugin package development, including `definePlugin(...)`, plugin sandboxes, custom nodes, custom credentials, and publishable plugin package structure. Use when building or updating a Codemation plugin package or the plugin starter template.
compatibility: Designed for Codemation plugin packages and the Codemation plugin starter template.
tags: plugin, node, package
---

# Codemation Plugin Development

## Mental model

A Codemation plugin is an npm package with a `codemation.plugin.ts` composition root that calls `definePlugin(...)`. It registers custom nodes and credential types, optionally declares MCP servers, and ships a sandbox app so the plugin is immediately testable. Consumers load the built JavaScript entry (`package.json#codemation.plugin`) — not TypeScript source. Plugin code follows the same `defineNode` / `defineCredential` patterns as app-level code; the plugin boundary is purely about packaging and distribution.

## When to use / when NOT

Use this skill for published plugin packages, plugin starter work, and sandbox-driven plugin development.
Do not use for ordinary consumer workflow-only changes unless the work needs plugin packaging or reusable extension boundaries.

## Quickstart

```ts
import { definePlugin } from "@codemation/host/authoring";

export default definePlugin({
  nodes: [myNode],
  credentials: [myCredentialType],
  // mcpServers: [...],  // optional — see Decision branches below
});
```

For full patterns — plugin package layout, sandbox setup, WorkflowTestKit usage, MCP server declaration, and publishing — use your harness's example-discovery tool: `find_examples({ query: "definePlugin" })` or `find_examples({ query: "plugin node credential" })`.

## Decision branches & gotchas

**Plugin package layout:** `codemation.plugin.ts` is the composition root; `src/nodes/*` for node definitions; `src/credentialTypes/*` for credential types; `src/index.ts` for public package exports; `test/*.test.ts` for Vitest + WorkflowTestKit tests.

**WorkflowTestKit:** import from `@codemation/core/testing`. Use `registerDefinedNodes([...])` for `defineNode` packages, then `runNode(...)` or `run(...)` for fuller graphs. Use `codemation dev:plugin` when you need the UI and persistence.

**Declaring MCP servers:** add `mcpServers: [declaration]` to `definePlugin(...)`. Each `McpServerDeclaration` requires `id` (globally unique slug `/^[a-z0-9-]+$/`), `displayName`, `description`, `transport`, `url`, and optional `acceptedCredentialTypes`. Use plugin-declared MCP servers when the provider has non-standard auth, or when co-locating with custom nodes for the same provider. For standard SaaS providers with OAuth/API-key credential types, prefer the control-plane registry — no plugin code needed.

**Merge precedence (MCP servers):** plugin declarations < `codemation.config.ts` < control-plane registry (last-write-wins on `id` collisions). A warning is logged when a higher-priority source shadows a plugin declaration.

**Publishing guardrail:** `package.json#codemation.plugin` must point at runnable JavaScript (`./dist/codemation.plugin.js`). Do not rely on consumers TypeScript-loading plugin files from `node_modules`.

## Anti-patterns

- Do not put plugin registration logic inside workflow files — use `codemation.plugin.ts` as the composition root.
- Do not ship source-only plugin entries as runtime dependencies — publish `dist/**`.
- Do not declare an MCP server in a plugin for standard OAuth/API-key providers already in the control-plane registry — prefer the registry fast lane.

## Read next when needed

- Read `references/plugin-structure.md` for package layout and node-versus-credential guidance.
