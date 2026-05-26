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
OAuth credential types declare clientId/clientSecret as part of their
own schema (publicFields/secretFields). The user enters them in the
credential dialog — they live ON the CredentialInstance, not in a
separate config block.

User opens credential dialog → picks "oauth.google.gmail"
   │
   ├─ fills "OAuth Client ID"     (publicConfig.clientId)
   ├─ fills "OAuth Client Secret" (material.clientSecret)
   ├─ fills "Display name"
   ▼
Clicks Create → instance is saved with app credentials but no tokens yet.
   │
   ▼
Clicks Connect →
   ▼
LocalOAuthFlowExecutor.start({ typeId, instanceId, scopes })
   │  loads the instance, reads clientId from publicConfig,
   │  loads clientSecret from material
   │  builds Google authorize URL with the type's default scopes
   ▼
Browser → Google consent → callback → host exchanges code for tokens
   │
   ▼
CredentialStore updates the existing instance:
   CredentialInstance { typeId:        "oauth.google.gmail",
                        publicConfig:  { clientId },
                        material:      { clientSecret,
                                         accessToken,
                                         refreshToken,
                                         expiresAt,
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

| #   | Question                                      | Decision                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | OAuth app id/secret storage in framework mode | Lives **on the credential instance** (clientId in `publicConfig`, clientSecret in `material`). OAuth credential types declare these in their schema (`publicFields`/`secretFields`). No separate config block — keeps app credentials co-located with the tokens they authorize. Users may, of course, source the values from `process.env` in the dialog form. |
| 2   | Per-slot scope refinement                     | Skip for v1. Broad-by-default.                                                                                                                                                                                                                                                                                                                                  |
| 3   | Control-plane override semantics              | Full replacement (simpler, predictable). No scope-union.                                                                                                                                                                                                                                                                                                        |
| 4   | Backwards-compatibility migration             | None needed. Nobody uses framework or control-plane yet.                                                                                                                                                                                                                                                                                                        |
| 5   | Reconsent UX                                  | Validate at workflow activation time. UI surfacing later as a "workflow linter" feature.                                                                                                                                                                                                                                                                        |

## Implementation phases (→ stories in sprint-17)

| Phase | Concern                                                                                      | Story refs         |
| ----- | -------------------------------------------------------------------------------------------- | ------------------ |
| 1     | Mode-agnostic plumbing: `OAuthFlowExecutor` interface + `LocalOAuthFlowExecutor` + DI wiring | 1.1, 1.2, 1.3      |
| 2     | Framework presets (clientId/clientSecret as type schema) + dialog "Connect"                  | 2.2, 2.3           |
| 3     | Migrate Gmail (the validation): trigger node + MCP both share one credential                 | 3.1, 3.2, 3.3      |
| 4     | Control-plane live catalog (replaces pairing-time push) + `ManagedOAuthFlowExecutor`         | 4.1, 4.2, 4.3, 4.4 |
| 5     | Cleanup of v0 broker machinery                                                               | 5.1, 5.2, 5.3      |
| 6     | Activation-time scope validation                                                             | 6.1                |
| 7     | Control-plane integration test on Windows                                                    | 7.1, 7.2, 7.3      |

## Material provider seam (added 2026-05-26, refined 2026-05-26)

> **Status**: 🟡 in flight under `planning/sprints/credentials-vault/`.
> Supersedes the earlier "CredentialStore as adapter" framing
> (`planning/sprints/current/`), which got the abstraction wrong.
>
> **Scope**: this section is **about persistence of material bytes**, not
> about the OAuth dance. It does not change anything in the four-concept
> model above. It refines concept 3 (`CredentialInstance` storage) by
> introducing a new `CredentialMaterialProvider` seam so refresh tokens can
> stay control-plane-side in managed mode, **without touching the existing
> `CredentialStore`**.

### Why

The original design treats the host's `CredentialStore` as a single
implementation. The earlier vault draft proposed swapping the entire
`CredentialStore` in managed mode. That was wrong: in managed mode, only the
**material** (access/refresh tokens) needs to live at CP. Everything else —
`CredentialInstance` rows, slot bindings, the type catalog — stays in the
workspace's existing `PrismaCredentialStore`, unchanged.

We close the refresh-token-exfiltration gap with a smaller seam: a new
`CredentialMaterialProvider` interface that sits behind the credential
resolver, and one new field on `CredentialInstance` rows.

### The new abstraction

```
┌──────────────────────────────────────────────────────────────────────┐
│ CredentialMaterialProvider (interface, @codemation/core)             │
│   getMaterial(                                                       │
│     ref: { source: "local" | "control-plane"; id: string },          │
│     context: CallerContext                                           │
│   ): Promise<MaterialBundle>;                                        │
│   setMaterial(ref, material): Promise<void>;  // throws in CP impl   │
└──────────────────────────────────────────────────────────────────────┘
       ▲                                          ▲
       │ implements                               │ implements
       │                                          │
┌──────┴───────────────────────────────┐  ┌───────┴──────────────────────────────────────┐
│ LocalCredentialMaterialProvider (FW) │  │ ControlPlaneCredentialMaterialProvider (FW)  │
│ - reads `material` column from the   │  │ - HMAC GET /internal/credentials/:ref/material│
│   existing PrismaCredentialStore row │  │   with serialized CallerContext              │
│ - writes allowed                     │  │ - setMaterial throws                         │
│                                      │  │     ManagedCredentialMaterialWriteError      │
└──────────────────────────────────────┘  └──────────────────────────────────────────────┘
```

`CredentialInstance` gains **one** new field:

```
material: { source: "local" | "control-plane"; ref: string }
```

- For local rows: `material` column on the row holds the bytes; the new
  pointer's `ref` is the instance id. The existing `PrismaCredentialStore`
  is unchanged.
- For CP-source rows: the workspace stores **only** the pointer. The bytes
  live in CP. The provider fetches them at use time.

DI selects between the two providers at boot using the same managed-mode
detection that selects `LocalOAuthFlowExecutor` vs `ManagedOAuthFlowExecutor`.
A small `CompositeMaterialProvider` dispatches by `ref.source` so both modes
can in principle coexist (e.g., a managed-mode workspace can still serve a
hypothetical local-source credential — though in practice managed mode
creates only CP-source rows).

### Caller context — required for every CP read

Every CP material fetch must carry caller context so CP can record what is
using each credential. This is the audit + UX trail that replaces the
workspace-side credentials page.

```
type CallerContext = {
  workspaceId: string;
  caller:
    | { kind: "workflow-node"; workflowId: string; nodeId: string }
    | { kind: "concierge"; chatId: string }
    | { kind: "research-agent"; chatId: string }
    | { kind: "manual"; userId: string };
  reason?: string;
};
```

CP records this on an append-only audit row per fetch and renders it on the
"Connected apps" page as "used by N nodes across M workflows" with
drill-down to (workflow, node, last-used) pairs.

### Read path in managed mode

```
Node executes → credential resolver → CompositeMaterialProvider
                                              │
                                              ▼ (ref.source = "control-plane")
                                       CachingCredentialMaterialProvider (decorator)
                                              │ cache hit? return.
                                              │ cache miss / expired:
                                              ▼
                                       ControlPlaneCredentialMaterialProvider
                                              │
                                       HMAC GET /internal/credentials/:ref/material
                                       body: { callerContext }
                                              │
                                              ▼
                                       Control plane:
                                         expired? refresh upstream first.
                                         append audit row w/ callerContext.
                                         return { accessToken, expiresAt, scopes,
                                                  providerAccountId, typeId }
                                         (refresh token NEVER in response)
                                              │
                                              ▼
                                       Cache stores in in-memory map keyed by
                                       (source, ref) with TTL =
                                       min(expiresIn − 60s, 5 min hard cap).
```

### Throw-on-write — narrowly scoped

`setMaterial` on `ControlPlaneCredentialMaterialProvider` throws
`ManagedCredentialMaterialWriteError`. The error is exported from
`@codemation/core` so call sites can `instanceof`-check it.

Crucially, this **does not** throw on local instance-metadata writes — the
existing `CredentialInstance` create/update path in `PrismaCredentialStore`
still works in managed mode. That's what lets the concierge bind a node to
a CP-source credential by upserting a row with
`material: { source: "control-plane", ref: <cp_id> }` from inside the
workspace. The pointer goes in, the bytes don't.

The OAuth dance writes material at CP (not via the workspace) — the workspace
reads it back through `/internal/credentials/:ref/material` on next use.

### In-memory cache

In-process only, never serialized to disk. Keyed by `(ref.source, ref.id)`.
TTL = `min(returnedExpiresInMs − 60_000, 5 * 60_000)` (hard cap 5 min).
Hits do not contact CP — by design, audit rows are per-fetch, not
per-execution-millisecond. `setMaterial` (local path) invalidates the entry
on success.

### Connected apps UX (managed mode only)

D7: the workspace has **no credentials page** in managed mode. The CP
"Connected apps" page is the canonical view:

- Per user, cross-workspace. Grouped/filtered by workspace.
- A credential is workspace-scoped (`userId + workspaceId`). v1 ACL:
  workspace membership = usability. No per-member ACL.
- Multiple accounts of the same type are explicitly allowed; the label is
  the `providerAccountId` (email for Google, `team_id` for Slack, …)
  recorded at OAuth callback time.
- Each row renders usage: "used by N nodes across M workflows in 'Workspace
  Foo'" + last-used-at, computed from the audit table.
- Concierge binding flow: `list_credentials_for_type` → 0/1/2+ results
  branches to `present_connect_button` / silent bind / `ask_choice`.
  Bindings store the explicit `materialRef`; re-binding requires user
  action.

### What this does NOT change

- Concepts 1, 2, 4 from the original four-concept model are untouched.
- The shape of `CredentialInstanceRecord` is unchanged **except** for the
  added `material: {source, ref}` field.
- The OAuth flow executor split (`Local` vs `Managed`) is unchanged.
- The existing `PrismaCredentialStore` is unchanged — no rename, no
  interface swap. The provider sits beside it, not on top of it.
- Standalone mode is unaffected. The workspace credentials UI stays for OSS
  users.
