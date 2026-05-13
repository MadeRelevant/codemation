# Sprint 2 Story 15 — End-to-end smoke: cron → agent → Gmail MCP

A single workflow that proves stories 6–14 hang together end-to-end:

```
CronTrigger (every 60 s) → AIAgent(mcpServers: ["gmail"]) → log items
```

The Gmail MCP server declaration arrives via the control-plane registry fetcher
(`source: "controlPlane"`, D6 in mcp-design.md). **No plugin package is used.**

This is a **manual sprint-review smoke test**, not an automated CI test. Automated
integration coverage is deferred post-sprint.

---

## Setup steps

### 1. Apply CP migrations and seed the Gmail MCP row (Story 12)

In the control-plane repo (`codemation-control-plane`):

```sh
pnpm prisma migrate deploy
pnpm run seed   # seeds the "gmail" McpServer row and the "google-mail" OAuthApp row
```

The seed inserts an `McpServer` row with `id = "gmail"` and a placeholder URL.
The `OAuthApp` row uses key `"google-mail"` with `scopesAllowed` containing the Gmail
read/compose scopes.

### 2. Set GMAIL_MCP_URL in the control-plane .env

The seed uses `https://example.invalid/gmail-mcp` as a placeholder. Override it with a
real Gmail MCP server URL:

```
# codemation-control-plane/.env
GMAIL_MCP_URL=https://mcp.googleapis.com/gmail   # or your self-hosted instance
```

Restart the control-plane after changing this env var. The `McpRegistryFetcher` in the
framework host polls this URL and merges the declaration into the catalog.

> **Note:** As of Story 12, no live Gmail MCP server URL is guaranteed by the framework.
> The operator must provide one. If no real URL is available, the agent's tool calls will
> fail with a network error (logged at debug level); the workflow will not crash.

### 3. Pair the installation with the control plane (Story 1 setup)

Add to `apps/test-dev/.env`:

```
CODEMATION_CONTROL_PLANE_URL=http://localhost:4000   # or wherever CP runs
WORKSPACE_PAIRING_SECRET=<shared secret from CP admin panel>
```

The `McpRegistryFetcher` uses HMAC-signed requests (`PairedFetch`) — it no-ops
entirely if `WORKSPACE_PAIRING_SECRET` is not set, so the Gmail catalog entry will never
arrive.

### 4. Authenticate Gmail via the control-plane broker (Story 5)

In the Codemation UI (concierge chat or credential panel):

1. Open the Connect dialog and choose **Google Mail**.
2. Complete the OAuth dance through the CP broker.
3. Confirm that a `CredentialInstance` with `oauthAppKey = "google-mail"` and
   `status = "connected"` appears on the installation.

The `mcpServers: ["gmail"]` shorthand auto-resolves when **exactly one** such credential
instance exists. If multiple exist, the agent will throw at bind time — switch to the
explicit binding form:

```ts
mcpServers: {
  gmail: {
    credential: "<instanceId>";
  }
}
```

### 5. Ensure OPENAI_API_KEY is set

The agent uses `openAiChatModelPresets.demoGpt4oMini` (GPT-4o-mini). Set in `.env`:

```
OPENAI_API_KEY=sk-...
```

### 6. Run pnpm dev and watch logs

```sh
pnpm dev
```

Wait up to 60 seconds for the first cron tick. Enable debug logging to see MCP spans:

```sh
CODEMATION_LOG_LEVEL=debug pnpm dev
```

---

## Acceptance criteria (manual checks for sprint review)

These are not automated. Check each manually during the sprint review.

| #   | Criterion                                                                                                                                                                                       | Status                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | `pnpm dev` starts without error with the Gmail credential connected and env vars set                                                                                                            | Manual                            |
| 2   | On the first cron tick, the agent node activates; debug logs show at least one `find_tools` span attributed to `"gmail"`                                                                        | Manual                            |
| 3   | With unread Gmail messages present: agent produces one or more items; `log-results` logs them                                                                                                   | Manual                            |
| 4   | With no unread messages: agent produces zero items; workflow run completes with `halted` status; no error                                                                                       | Manual                            |
| 5   | With scope mismatch (connected with `gmail.readonly` only, agent attempts a write): workflow run completes with `needsReconsent` in output; run is NOT marked `failed` with unhandled exception | Manual                            |
| 6   | `catalog.getAll()` shows `source: "controlPlane"` for `"gmail"` (not `"plugin"` or `"config"`)                                                                                                  | Manual                            |
| 7   | No `@codemation/core-nodes-gmail` or similar plugin package appears in the workflow imports or `package.json`                                                                                   | Static — verifiable by inspection |

---

## Observing telemetry

At `CODEMATION_LOG_LEVEL=debug`, the `find_tools` meta-tool calls appear as spans tagged:

```json
{ "mcp.server_id": "gmail", "mcp.tool_name": "find_tools" }
```

Subsequent tool calls appear as:

```json
{ "mcp.server_id": "gmail", "mcp.tool_name": "<actual tool name>" }
```

These are also visible in the telemetry span view in the Next.js UI (next-host).

---

## Scope-mismatch verification (acceptance criterion 5)

To trigger the structured failure path:

1. Connect Gmail with only `gmail.readonly` scope (narrow the scope in the OAuth dialog).
2. Modify the agent system prompt to request a send/write operation.
3. The agent's `callTool` returns a 403 / MCP permission error.
4. The workflow run output contains `needsReconsent: [{ serverId: "gmail", ... }]`.
5. Confirm no raw exception stack appears in the run output visible to users.

This verifies Story 11's `NeedsReconsentEvent` path end-to-end.

---

## Known integration gaps (found during Story 15 implementation)

1. **No live Gmail MCP URL.** Story 12 seeds `https://example.invalid/gmail-mcp` as a
   placeholder. The framework cannot fix this — a real MCP server URL must be provided
   by the operator via `GMAIL_MCP_URL` in the CP environment. The smoke test will fail
   at the tool-call step (network error) until this is set.

2. **Credential instance pre-connection required.** There is no automated seeding script
   that bypasses the OAuth dance and pushes a test token directly. A developer must
   click Connect in the UI before the smoke can run with real data.

3. **Pairing required for catalog merge.** If `WORKSPACE_PAIRING_SECRET` is not set, the
   `McpRegistryFetcher` no-ops and the `"gmail"` catalog entry never arrives. The agent
   will fail at bind time with a "unknown MCP server" error. This is expected and correct
   behaviour — it is a deployment configuration gap, not a framework bug.

4. **`McpRegistryFetcher` poll interval defaults to 300 s.** On first startup, the catalog
   entry may not be immediately available. Override with
   `CODEMATION_REGISTRY_POLL_INTERVAL_SECONDS=10` during dev to speed up the initial fetch.
