---
name: codemation-plugin-development
description: Guides Codemation plugin package development, including `definePlugin(...)`, plugin sandboxes, custom nodes, custom credentials, and publishable plugin package structure. Use when building or updating a Codemation plugin package or the plugin starter template.
compatibility: Designed for Codemation plugin packages and the Codemation plugin starter template.
---

# Codemation Plugin Development

## Use this skill when

Use this skill for published plugin packages, plugin starter work, and sandbox-driven plugin development.

Do not use this skill for ordinary consumer workflow-only changes unless the work needs plugin packaging or reusable extension boundaries.

## Default approach

1. Treat `codemation.plugin.ts` as the plugin composition root.
2. Register custom credentials and custom nodes from explicit modules.
3. Keep the sandbox app small and useful so plugin behavior is testable immediately.
4. Prefer helper-based node and credential definitions first, then drop to class-based APIs only when needed.

## Plugin rules

1. Export a plugin with `definePlugin(...)`.
2. Keep plugin registration separate from node and credential implementation modules.
3. Use the sandbox app to exercise the plugin right away.
4. Keep the package publishable like a normal npm package.
5. Treat `codemation.plugin.ts` as the plugin repo's source composition root; consumer projects should load the built JavaScript entry declared in `package.json#codemation.plugin`.

## Common plugin pieces

- `codemation.plugin.ts`: plugin registration and sandbox app source, compiled to the published plugin entry in `dist/`
- `src/nodes/*`: custom node definitions (`defineNode` → **`execute`**; `defineBatchNode` → batch **`run`**)
- `src/credentialTypes/*`: custom credential definitions
- `src/index.ts`: package exports
- `test/*.test.ts` (optional): Vitest + `WorkflowTestKit` from `@codemation/core/testing` for engine-backed unit tests without starting the full host (`pnpm test`)

## Packaging guardrail

- `package.json#codemation.plugin` should point at runnable JavaScript such as `./dist/codemation.plugin.js`.
- Do not rely on consumers TypeScript-loading plugin files from `node_modules`.
- Prefer publishing `dist/**` plus package metadata/docs rather than shipping source-only plugin entry files as runtime dependencies.

## Unit tests (`WorkflowTestKit`)

Import **`WorkflowTestKit`** from **`@codemation/core/testing`**. Use **`registerDefinedNodes([...])`** for `defineNode` packages, then **`runNode({ node: yourNode.create(...), items })`** or **`run({ workflow, items })`** for fuller graphs. Prefer this for fast node tests; use **`codemation dev:plugin`** when you need the UI and persistence.

## Declaring MCP servers from a plugin (`mcpServers?`)

A plugin can declare MCP servers that the framework merges into its in-memory catalog at startup. Use this for providers that need non-standard auth, custom adapter logic, or are shipping alongside custom nodes. For standard SaaS providers (OAuth via broker, plain bearer/API key), prefer the control-plane registry instead — no plugin code required.

### When to use plugin-declared MCP servers

- The provider's MCP server has non-standard auth the generic credential types cannot express.
- The plugin already ships custom nodes for the same provider and wants to co-locate the MCP declaration.
- Self-hosted deployments where no control-plane registry is available.

### Required fields

```ts
import { definePlugin } from "@codemation/host/authoring";
import type { McpServerDeclaration } from "@codemation/core";

const myServer: McpServerDeclaration = {
  id: "my-service", // globally unique slug: /^[a-z0-9-]+$/
  displayName: "My Service",
  description: "Provides MCP tools for My Service.",
  transport: "http",
  url: "https://mcp.my-service.com",
  // Credential types this server accepts. Users bind a credential instance
  // per slot via the UI. Omit (or set to []) for servers requiring no auth.
  acceptedCredentialTypes: ["my-service.bearer-token"],
};

export default definePlugin({
  mcpServers: [myServer],
  // credentials, nodes, register, etc.
});
```

### Merge precedence

The framework merges from three sources in this order (last-write-wins on `id` collisions):

1. **Plugin** (lowest) — code in `codemation.plugin.ts`
2. **`codemation.config.ts`** — dev/self-host declarations
3. **Control-plane registry** (highest) — managed-mode fast lane; shadows plugin declarations to fix descriptions without a plugin release

A warning is logged when a higher-priority source shadows a plugin declaration. This is intentional.

## Read next when needed

- Read `references/plugin-structure.md` for package layout and node-versus-credential guidance.
