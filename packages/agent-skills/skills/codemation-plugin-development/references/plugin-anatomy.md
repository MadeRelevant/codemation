# Plugin Anatomy

Plugin authoring is a **framework-author / non-managed task**. Managed-mode agents almost never need to create or modify plugin packages — they work with credential slots and workflow DSL. This reference is for developers building and publishing reusable Codemation plugin packages.

## Quickstart

```ts
import { definePlugin } from "@codemation/host/authoring";

export default definePlugin({
  nodes: [myNode],
  credentials: [myCredentialType],
  // mcpServers: [...],  // optional — see MCP section below
});
```

## Plugin package layout

```text
codemation.plugin.ts  ← composition root; calls definePlugin(...)
src/
  nodes/              ← defineNode / defineBatchNode / defineRestNode files
  credentialTypes/    ← defineCredential files
  index.ts            ← public package exports (types, session shapes)
test/
  *.test.ts           ← Vitest + WorkflowTestKit tests
```

## Composition root (`codemation.plugin.ts`)

The single file that:
- calls `definePlugin(...)` and registers nodes + credentials
- optionally defines a sandbox app via `defineCodemationApp(...)`

Consumers discover the plugin through `package.json#codemation.plugin`, which must point at built JavaScript in `dist/` — NOT TypeScript source.

## Node guidance

- Start with `defineNode(...)` and `execute(...)` for per-item nodes (most common).
- Use `defineBatchNode(...)` only when the node must process the whole activation batch in one `run(items, ...)`.
- Keep runtime logic close to the node definition; use class-based APIs only when you need constructor-injected collaborators.

## Credential guidance

- Start with `defineCredential(...)`.
- Build typed sessions in `createSession(...)`.
- Implement `test(...)` so operators can validate configuration before activation.
- For OAuth2 redirect flows, use the URL-template variant (`auth: { kind: "oauth2", authorizeUrl, tokenUrl, scopes }`).
- See the `codemation-credential-development` skill for detailed credential patterns.

## Declaring MCP servers in a plugin

> **Non-managed pattern.** In managed mode, MCP servers are loaded from the control plane — see `codemation-mcp-capabilities`. Plugin-declared MCP servers are for self-hosted / framework-author scenarios.

```ts
import { definePlugin } from "@codemation/host/authoring";
import type { McpServerDeclaration } from "@codemation/host/authoring";

const myMcpServer: McpServerDeclaration = {
  id: "my-provider-mcp",         // globally unique slug /^[a-z0-9-]+$/
  displayName: "My Provider",
  description: "Exposes My Provider tools to AIAgent.",
  transport: "streamable-http",
  url: "https://my-provider.example.com/mcp",
  acceptedCredentialTypes: ["my-provider.api-key"],
};

export default definePlugin({
  nodes: [myNode],
  credentials: [myCredentialType],
  mcpServers: [myMcpServer],
});
```

**Merge precedence:** plugin declarations < `codemation.config.ts` < control-plane registry. A warning is logged when a higher-priority source shadows a plugin declaration.

Use plugin-declared MCP servers only when the provider has non-standard auth or when co-locating with custom nodes for the same provider. For standard OAuth/API-key providers, prefer the control-plane registry.

## WorkflowTestKit

```ts
import { WorkflowTestKit } from "@codemation/core/testing";
// For defineNode packages:
import { registerDefinedNodes } from "@codemation/core/testing";
registerDefinedNodes([myNode]);
// Then use runNode(...) or run(...) for fuller graph tests.
```

## Binary payloads — never put bytes on item.json

```ts
// Inside execute(items, ctx) when a node fetches binary content:
const stored = await ctx.binary.attach({
  name: "report.pdf",
  body: Buffer.from(bytes),
  mimeType: "application/pdf",
  filename: "report.pdf",
});
const enriched = ctx.binary.withAttachment(item, "report.pdf", stored);
```

Only the `BinaryAttachment` reference (id, storageKey, mimeType, size) belongs on the item — not the bytes.

## Publishing

- `package.json#codemation.plugin` must point at `./dist/codemation.plugin.js`.
- Do not rely on consumers TypeScript-loading plugin files from `node_modules`.
- Treat the plugin as a normal npm package: install it in a Codemation app for auto-discovery.

## Anti-patterns

- Do not put plugin registration logic inside workflow files — use `codemation.plugin.ts`.
- Do not ship source-only plugin entries as runtime dependencies — publish `dist/**`.
- Do not declare an MCP server in a plugin for standard OAuth/API-key providers already in the control-plane registry.
