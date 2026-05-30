---
name: codemation-mcp-capabilities
description: Discover MCP servers registered on the Codemation control plane. Use before authoring agent workflows that reference mcpServers to find available server ids and their credential requirements.
compatibility: Requires an installation paired with a connected control plane (Sprint 2+).
tags: mcp, agent, tool
---

# Codemation MCP Capabilities

## Use this skill when

Use this skill before writing `agent({ mcpServers: ["..."] })` to discover what server ids are
available and what credential types they require. Without it, you'd have to guess server ids or
ask the user.

## How to search

Call `GET /api/registry/capabilities?query=<search term>` on the control-plane API.
The endpoint is session-authenticated (the control-plane session cookie is forwarded automatically
when called from within the workspace's paired context).

```
GET /api/registry/capabilities?query=gmail
```

Response shape (array of capability objects):

```json
[
  {
    "kind": "mcp-server",
    "id": "gmail",
    "displayName": "Gmail",
    "description": "Read, send, and manage Gmail messages and labels.",
    "acceptedCredentialTypes": ["oauth.google.gmail"]
  }
]
```

An empty query string returns all registered servers.

## Response fields

| Field                     | Type     | Notes                                                                |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `kind`                    | string   | Always `"mcp-server"` for now. Future: `"node"`, `"credential-type"` |
| `id`                      | string   | Stable slug — add this string to the agent's mcpServers array        |
| `displayName`             | string   | Human-readable name for UI or explanations                           |
| `description`             | string   | What the server does                                                 |
| `acceptedCredentialTypes` | string[] | Credential type ids accepted by this server (empty = no credential)  |

## Credential types

- **`"oauth.google.gmail"`** — user must connect a Google account credential instance via the
  credential dialog before the workflow runs. The same credential instance can be shared between
  a `GmailTrigger` node and the Gmail MCP server.
- **`"bearer_token"`** etc. — user configures a static credential via the credential dialog.
- **empty array** — no credential required. The server is usable immediately.

## Using results in workflow config

The `id` field from the response is added to the agent's `mcpServers` array. Each entry
surfaces a credential slot on the materialized MCP connection node (same shape as
ChatModel and Tool connection nodes); the user picks a specific credential instance via
the canvas credential dropdown — same flow as a trigger credential. A user may have
multiple instances of the same type (personal vs work Gmail); the dropdown surfaces all
matching instances.

```ts
new AIAgent({
  name: "Gmail reader",
  mcpServers: ["gmail"],
  // ...
});
```

Bind the credential instance via the UI before activation; there is no inline credential
field on the workflow definition.

## Example flow

1. User asks: "Build a workflow that reads Gmail and summarises unread messages."
2. Call `GET /api/registry/capabilities?query=gmail` → find `id: "gmail"`, `acceptedCredentialTypes: ["oauth.google.gmail"]`.
3. Report back: "Gmail MCP is available. The user will need to bind a `oauth.google.gmail` credential instance."
4. In the workflow, use `mcpServers: ["gmail"]`.
5. The user binds their credential instance via the canvas credential dropdown before activating.
