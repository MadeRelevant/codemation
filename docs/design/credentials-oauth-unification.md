# Credentials + OAuth unification — design

> **What this is**: the architectural target for v1 credentials. We're unifying how regular nodes (Gmail trigger, etc.) and MCP servers express their credential needs, and untangling the local-vs-managed OAuth dance from the credential type catalog.
>
> **How to use it**: this is the source of truth for the _architecture_. Each phase below maps to a story under `../../planning/sprints/sprint-17/stories/` (sibling-repo at `planning/sprints/sprint-17/`; see its [README](../../../planning/sprints/sprint-17/README.md) for the story index). When something here changes mid-flight, update both docs in the same PR.
>
> **Status**: 🟡 ratified architecture, implementation pending. Drafted 2026-05-22.
>
> **Owners**: framework team. Cross-repo: control-plane changes in Phase 4 / Phase 7.

## Background — what's tangled today (v0)

Four concepts are collapsed into one:

- **CredentialType**: the schema for stored credential material (a Gmail OAuth token, an API key, etc.)
- **OAuth flow executor**: who runs the OAuth dance (host locally, or control plane on the host's behalf)
- **OAuth app secret holder**: where `clientId`/`clientSecret` live (env var on host, or hidden inside control plane)
- **CredentialInstance**: a stored, bound, usable secret/token row in the host's database

Today the host has one credential type called `host.oauth2-via-broker` that **conflates all four**. The "broker" leaks into the framework-side type system, even though OSS users running standalone should never know it exists. Worse, MCP servers declare their credential need with a separate field (`McpServerDeclaration.credentialTypeId`) that can't share an instance with a regular node's slot — so you can't reuse one Gmail OAuth credential between your `GmailTrigger` node and your Gmail MCP server.

## The target — four concepts, cleanly separated

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. CredentialType (catalog)                                          │
│    e.g. "oauth.google.gmail"                                         │
│    - displayName, productName                                        │
│    - default scopes (broad — every scope the product needs)          │
│    - stored material schema (accessToken, refreshToken, …)           │
│    - identical contract in both deployment modes                     │
└──────────────────────────────────────────────────────────────────────┘
                │ referenced by
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Credential slot requirement                                       │
│    acceptedTypes: ["oauth.google.gmail"]                             │
│                                                                      │
│  Identical shape for regular nodes (GmailTrigger) AND MCP servers.   │
│  One instance of oauth.google.gmail satisfies BOTH.                  │
└──────────────────────────────────────────────────────────────────────┘
                │ bound to
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. CredentialInstance (stored in host's CredentialStore)             │
│    typeId: "oauth.google.gmail"                                      │
│    material: { accessToken, refreshToken, expiresAt, grantedScopes } │
│    No app id/secret here. No "broker" flag here.                     │
└──────────────────────────────────────────────────────────────────────┘
                ▲ produced by
                │
┌──────────────────────────────────────────────────────────────────────┐
│ 4. OAuthFlowExecutor (the "dance")                                   │
│    - LocalOAuthFlowExecutor:    uses app id/secret from local config │
│    - ManagedOAuthFlowExecutor:  delegates to control plane           │
│    DI selects one at boot; the rest of the system never branches.    │
└──────────────────────────────────────────────────────────────────────┘
```

**The win:** items 1–3 are mode-agnostic. Only item 4 differs. The OSS framework knows zero about "broker." The same credential instance binds to a Gmail trigger node and a Gmail MCP server because both slots accept the same type.

## Framework mode (OSS, standalone)

```
Workflow author in codemation.config.ts:
   oauthApps: [
     { type: "oauth.google.gmail",
       clientId:     process.env.GOOGLE_CLIENT_ID,
       clientSecret: process.env.GOOGLE_CLIENT_SECRET },
   ]
   ↑ may also be entered manually per CredentialInstance in the UI; the
     instance's own clientId/clientSecret wins over the config default.

User opens credential dialog → picks "oauth.google.gmail" → "Connect"
   │
   ▼
LocalOAuthFlowExecutor.start({ typeId, scopes })
   │  reads clientId/clientSecret from the instance, falling back to config
   │  builds Google authorize URL with the type's default scopes
   ▼
Browser → Google consent → callback → host exchanges code for tokens
   │
   ▼
CredentialStore writes:
   CredentialInstance { typeId: "oauth.google.gmail",
                        material: { accessToken, refreshToken, expiresAt,
                                    grantedScopes } }
```

## Managed mode (paired with control plane)

```
Control plane exposes LIVE catalogs (not pushed at pairing):
   GET /api/catalog/oauth-apps        ← which OAuth apps are usable
   GET /api/catalog/mcp-servers       ← which MCP servers are usable
   GET /api/catalog/credential-types  ← optional overrides of framework types

Host fetches on demand + caches. New MCP servers and OAuth apps published on
the control plane become available to workspace agents without a framework
package release.

User opens credential dialog → picks "oauth.google.gmail" → "Connect"
   │
   ▼
ManagedOAuthFlowExecutor.start({ typeId, scopes })
   │  POSTs to control plane: "begin dance for oauth.google.gmail"
   │  receives a consent URL → host opens it
   ▼
Browser → control plane → Google consent → callback to control plane
   │  control plane (which holds the app secret) exchanges code for tokens
   ▼
Control plane → POST /internal/credentials/push  (HMAC-signed)
   body: { typeId: "oauth.google.gmail",
           material: { accessToken, refreshToken, expiresAt, grantedScopes } }
   ▼
Host writes SAME-SHAPED CredentialInstance to CredentialStore.
   Workflow runtime uses it identically to framework mode.

Token refresh: same shape. ManagedOAuthFlowExecutor.refresh(...) asks control
   plane (which still holds the app secret). LocalOAuthFlowExecutor.refresh(...)
   calls Google with the stored refreshToken + local app secret.
```

## CredentialType catalog — framework defaults + consumer config + control-plane override

```
┌────────────────────────────────────────────────────────────────────┐
│ Layer 1 — framework defaults                                       │
│   Shipped in @codemation/oauth-presets (or similar)                │
│   oauth.google.gmail     — every Gmail scope                       │
│   oauth.google.calendar  — every Calendar scope                    │
│   oauth.microsoft.graph  — every Graph scope                       │
│   oauth.slack            — every Slack OAuth scope                 │
│   ...                                                              │
└────────────────────────────────────────────────────────────────────┘
                            +  (overlay)
┌────────────────────────────────────────────────────────────────────┐
│ Layer 2 — consumer codemation.config.ts                            │
│   app.registerCredentialType({                                     │
│     typeId: "oauth.google.gmail",                                  │
│     scopes: ["...gmail.readonly"]   // narrower override            │
│   })                                                               │
└────────────────────────────────────────────────────────────────────┘
                            +  (overlay; managed mode only)
┌────────────────────────────────────────────────────────────────────┐
│ Layer 3 — control-plane catalog (highest priority)                 │
│   Fetched live from /api/catalog/credential-types                  │
│   FULL REPLACEMENT for matching typeIds (no scope-union)           │
└────────────────────────────────────────────────────────────────────┘
                            ▼
                  CredentialTypeRegistry
              precedence: control plane > config > framework
```

### Scope refinement — keep broad defaults

For v1: **broader is better than narrower**. The framework default for `oauth.google.gmail` requests every Gmail scope. One consent covers every Gmail-using node in the user's workspace. Runtime errors from missing scopes are the worst UX outcome we can ship.

Slot-level scope refinement (a `GmailTrigger` declaring `requestedScopes: ["gmail.readonly"]`) is **not in v1**. It's noted here as a future improvement to be revisited once we have a workflow linter that can validate scopes at activation time.

## What disappears in v1

| v0                                       | v1                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `McpServerDeclaration.credentialKind`    | gone                                                                                           |
| `McpServerDeclaration.credentialTypeId`  | renamed to `acceptedCredentialTypes: string[]` (matches `CredentialRequirement.acceptedTypes`) |
| `McpServerDeclaration.oauthAppKey`       | gone — type id is the join key                                                                 |
| `host.oauth2-via-broker` credential type | gone — broker is now an implementation detail of `ManagedOAuthFlowExecutor`, not a type        |
| `RemoteOAuthRefreshDelegate`             | gone — refresh is uniform via `OAuthFlowExecutor.refresh(...)`                                 |
| Pairing-time push of MCP servers         | replaced by live catalog fetch                                                                 |

## Open questions — resolved

| #   | Question                                      | Decision                                                                                                                                         |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | OAuth app id/secret storage in framework mode | Reads from `oauthApps` in `codemation.config.ts` (which may read env). Can ALSO be entered manually per CredentialInstance. Instance value wins. |
| 2   | Per-slot scope refinement                     | Skip for v1. Broad-by-default.                                                                                                                   |
| 3   | Control-plane override semantics              | Full replacement (simpler, predictable). No scope-union.                                                                                         |
| 4   | Backwards-compatibility migration             | None needed. Nobody uses framework or control-plane yet.                                                                                         |
| 5   | Reconsent UX                                  | Validate at workflow activation time. UI surfacing later as a "workflow linter" feature.                                                         |

## Implementation phases (→ stories in sprint-17)

| Phase | Concern                                                                                      | Story refs         |
| ----- | -------------------------------------------------------------------------------------------- | ------------------ |
| 1     | Mode-agnostic plumbing: `OAuthFlowExecutor` interface + `LocalOAuthFlowExecutor` + DI wiring | 1.1, 1.2, 1.3      |
| 2     | Framework presets + `oauthApps` config + dialog "Connect"                                    | 2.1, 2.2, 2.3      |
| 3     | Migrate Gmail (the validation): trigger node + MCP both share one credential                 | 3.1, 3.2, 3.3      |
| 4     | Control-plane live catalog (replaces pairing-time push) + `ManagedOAuthFlowExecutor`         | 4.1, 4.2, 4.3, 4.4 |
| 5     | Cleanup of v0 broker machinery                                                               | 5.1, 5.2, 5.3      |
| 6     | Activation-time scope validation                                                             | 6.1                |
| 7     | Control-plane integration test on Windows                                                    | 7.1, 7.2, 7.3      |
