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

**Plugin authoring is a framework-author / non-managed task.** Managed-mode agents work with credential slots and workflow DSL — they do not author or modify plugin packages.

Use this skill for published plugin packages, plugin starter work, and sandbox-driven plugin development. Do not use for ordinary consumer workflow-only changes.

## Decision branches & gotchas

**MCP servers in plugins:** Plugin-declared `mcpServers` is a non-managed pattern for self-hosted / framework-author scenarios. In managed mode, MCP servers are loaded from the control plane — see `codemation-mcp-capabilities` for the managed path.

**Publishing guardrail:** `package.json#codemation.plugin` must point at runnable JavaScript (`./dist/codemation.plugin.js`). Do not rely on consumers TypeScript-loading plugin files from `node_modules`.

## Read next when needed

- Read `references/plugin-anatomy.md` for the full `definePlugin(...)` code, package layout, sandbox setup, MCP server declaration, binary payload rules, and publishing guidance.
- Read `references/plugin-structure.md` for a concise package layout reference.
