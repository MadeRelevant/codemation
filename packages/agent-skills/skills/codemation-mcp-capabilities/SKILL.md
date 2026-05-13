---
name: codemation-mcp-capabilities
description: Discover MCP servers registered on the Codemation control plane. Use before authoring agent workflows that reference mcpServers to find available server ids and their credential requirements.
compatibility: Requires an installation paired with a connected control plane (Sprint 2+).
---

# Codemation MCP Capabilities

## Use this skill when

Use this skill before writing `agent({ mcpServers: [...] })` to discover what server ids are
available and what credential kind they require. Without it, you'd have to guess server ids or
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
    "credentialKind": "oauth2-via-broker",
    "oauthAppKey": "google-mail"
  }
]
```

An empty query string returns all registered servers.

## Response fields

| Field            | Type    | Notes                                                                |
| ---------------- | ------- | -------------------------------------------------------------------- |
| `kind`           | string  | Always `"mcp-server"` for now. Future: `"node"`, `"credential-type"` |
| `id`             | string  | Stable slug — use this as the mcpServers key in the workflow         |
| `displayName`    | string  | Human-readable name for UI or explanations                           |
| `description`    | string  | What the server does                                                 |
| `credentialKind` | string  | `"oauth2-via-broker"` \| `"bearer"` \| `"basic"` \| `"none"`         |
| `oauthAppKey`    | string? | Present when `credentialKind = "oauth2-via-broker"`                  |

## Credential kinds

- **`"oauth2-via-broker"`** — user must connect via the concierge's `present_connect_button` tool
  before the workflow runs. The concierge renders an OAuth chip; tokens are delivered
  server-to-server and never enter the LLM context.
- **`"bearer"` / `"basic"`** — user configures a static credential via the installation's
  credential dialog (opens out-of-band). The concierge renders a "Configure credential" chip.
- **`"none"`** — no credential required. The server is usable immediately.

## Using results in workflow config

The `id` field from the response maps directly to the `mcpServers` key in the agent config.

```ts
// Shorthand — resolves to the single connected credential matching this server
agent({
  mcpServers: ["gmail"],
});

// Explicit binding — use when multiple credential instances exist
agent({
  mcpServers: {
    gmail: { credential: "<credentialInstanceId>" },
  },
});
```

Shorthand refuses to resolve if multiple `CredentialInstance` rows match the server's
`oauthAppKey` — the workflow author must bind explicitly. This is intentional.

## Example flow

1. User asks: "Build a workflow that reads Gmail and summarises unread messages."
2. Call `GET /api/registry/capabilities?query=gmail` → find `id: "gmail"`, `credentialKind: "oauth2-via-broker"`.
3. Report back: "Gmail MCP is available. The user will need to connect their Google account."
4. In the workflow, use `agent({ mcpServers: ["gmail"] })`.
5. The concierge handles credential acquisition via `present_connect_button` before running.
