---
name: codemation-mcp-capabilities
description: Discover MCP servers registered on the Codemation control plane. Use before authoring agent workflows that reference mcpServers to find available server ids and their credential requirements.
compatibility: Requires an installation paired with a connected control plane (Sprint 2+).
tags: mcp, agent, tool
---

# Codemation MCP Capabilities

## Mental model

MCP servers extend `AIAgent` with tool access to external services (Gmail, Sheets, etc.). Server ids and credential requirements come from the control-plane registry — they are not hard-coded in framework code. The agent's `mcpServers` array contains stable server id slugs; each declared server surfaces a credential slot the operator must bind in the canvas before activation.

## When to use / when NOT

Use this skill before writing `agent({ mcpServers: ["..."] })` to discover available server ids and their credential types.
Do not use for general AIAgent authoring — read `codemation-ai-agent-node` for that.

## Managed mode: CP-loaded MCP servers (default path)

In **managed mode**, MCP servers are loaded from the **control plane (CP)** — not declared in plugin code. Discover available servers by querying the CP registry:

```
GET /api/registry/capabilities?query=gmail
```

Response contains objects with `{ kind, id, displayName, description, acceptedCredentialTypes }`. Use `id` in the workflow's `mcpServers` array. An empty `query` string returns all registered servers.

For a full wired example — cron workflow + AIAgent + mcpServers — use your harness's example-discovery tool: `find_examples({ query: "AIAgent gmail mcpServers" })` or `find_examples({ query: "mcp server" })`.

## Non-managed: plugin-declared MCP servers

In self-hosted / non-managed deployments, MCP servers can also be declared via `mcpServers: [...]` in a `definePlugin(...)` call. This is a framework-author pattern — do not use it in managed-mode workflows. See `references/plugin-anatomy.md` in the `codemation-plugin-development` skill for the plugin declaration syntax.

## Decision branches & gotchas

**Credential types:** `"oauth.google.gmail"` requires the user to connect a Google account via the credential dialog before the workflow runs. The same instance can be shared between a `GmailTrigger` and the Gmail MCP server. An empty `acceptedCredentialTypes` array means no credential is needed.

**Multiple instances:** a user may have multiple instances of the same credential type (personal vs work Gmail). The canvas credential dropdown surfaces all matching instances — the operator picks the one to bind.

**Bind via UI only:** there is no inline credential field on the workflow definition. The operator binds the credential instance via the canvas credential dropdown before activation.

**Typical flow (managed):**
1. `GET /api/registry/capabilities?query=<term>` → find `id` and `acceptedCredentialTypes`.
2. Add `id` to `mcpServers` in the `AIAgent` config.
3. Report: "The user will need to bind a `<type>` credential instance via the canvas before activating."

## Anti-patterns

- Do not guess server ids — always query the registry first.
- Do not add `acceptedCredentialTypes` to the workflow definition — credential binding is UI-driven, not code-driven.
- Do not declare MCP servers inside plugin code for managed-mode workflows — use the CP registry instead.
