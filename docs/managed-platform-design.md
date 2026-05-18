# Managed Platform — Design Decisions

> Forward-looking design doc, not current architecture. Captures the decisions made
> while reasoning through how to take Codemation from a code-first framework to a
> managed platform aimed at non-technical users. Implementation has not started.

## Goal

Bring agentic automation to non-technical users ("boomers") via a chat-first UX,
while keeping Codemation's framework usable by developers on their own infra.
Same node code, two deployment modes — managed and self-hosted.

## Decision summary (the TL;DR)

| #   | Decision                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Control plane / data plane split.** Master secrets, OAuth apps, billing, concierge agent, scheduler all in control plane. Tenant installations live in the data plane and never hold platform-wide secrets.                                       |
| 2   | **Every installation gets its own Firecracker microVM**, regardless of tier. Shared tier = smaller VMs packed densely; dedicated tier = guaranteed VMs on dedicated hosts. The VM is the security boundary.                                         |
| 3   | **No in-process sandbox tier.** All code in a tenant's VM is treated as that tenant's code. Hardware isolation makes per-node trust gating unnecessary.                                                                                             |
| 4   | **OAuth model mirrors n8n cloud.** Control plane runs the OAuth dance with Codemation's master apps; resulting per-user tokens are shipped into the tenant's vault. Vetted nodes use the real SDKs directly with those tokens.                      |
| 5   | **Master OAuth client_id/secret never enters a VM.** Only per-user access/refresh tokens do.                                                                                                                                                        |
| 6   | **No SDK wrapping, no egress proxy for credentials.** Tenant calls Gmail/Slack/etc. directly from the VM using the SDK and the user's tokens.                                                                                                       |
| 7   | **`CredentialResolver` interface in `core`.** Self-hosted resolver and managed resolver differ at this single seam; node code is identical across modes.                                                                                            |
| 8   | **Egress is open by default.** Observed/metered for billing and abuse detection, but not policed. Users automate arbitrary APIs; we don't try to allowlist the internet.                                                                            |
| 9   | **Plan-as-typed-artifact** is the security/UX bridge. The concierge produces a structured plan (capabilities, destinations, data flows). User approves. UI surfaces deviations. Not a runtime security boundary, but a real consent/audit artifact. |
| 10  | **Two agents, two locations.** Concierge agent in control plane (multi-tenant, intent → plan). Coding agent as MCP per-installation (writes/edits nodes inside that tenant's VM).                                                                   |
| 11  | **Managed AI / OCR live behind a gateway** in control plane. Metering happens there, not in the VM. Self-hosted users use provider-specific nodes (Anthropic, Azure OCR, etc.) directly.                                                            |
| 12  | **Core stays ignorant of "managed."** Managed-ness is a deployment concern surfaced via resolvers and node packages, never via branches in core.                                                                                                    |

## Big picture

```
                  ┌──────────────────────────────────────────────────────┐
                  │                    CONTROL PLANE                     │
                  │              (Codemation-trusted, single region)     │
                  │                                                      │
   user ──chat──▶ │  ┌──────────────┐    ┌──────────────────────────┐    │
   (browser)      │  │  Concierge   │    │   Provisioner /          │    │
                  │  │    Agent     │    │   Scheduler              │    │
                  │  │              │    │   (k8s + Firecracker)    │    │
                  │  └──────┬───────┘    └────────────┬─────────────┘    │
                  │         │                         │                  │
                  │  ┌──────▼───────┐    ┌────────────▼─────────────┐    │
                  │  │   Planner    │    │  OAuth Broker /           │    │
                  │  │    (LLM)     │    │  Token Vault              │    │
                  │  │              │    │  (master OAuth apps,      │    │
                  │  └──────────────┘    │   per-user tokens stored  │    │
                  │                      │   in per-tenant DBs)      │    │
                  │  ┌──────────────┐    └─────────────┬─────────────┘    │
                  │  │ Auth/Billing │                  │                  │
                  │  └──────────────┘                  │                  │
                  │                                    │                  │
                  │  ┌──────────────────────┐  ┌───────▼──────────────┐   │
                  │  │ Managed AI / OCR     │  │ Token-delivery       │   │
                  │  │ Gateway (metered)    │  │ channel (signed)     │   │
                  │  └──────────┬───────────┘  └───────┬──────────────┘   │
                  └─────────────┼──────────────────────┼──────────────────┘
                                │                      │
                  ─────────────────────────────────────────────────────
                                │                      │
                  ┌─────────────▼──────────────────────▼─────────────────┐
                  │              DATA PLANE (per region)                 │
                  │       k8s + Firecracker, one microVM per tenant      │
                  │                                                      │
                  │   ┌────────────────────────────┐                     │
                  │   │  Tenant Installation A     │   ┌─────────────┐   │
                  │   │  (Firecracker microVM)     │   │  Tenant B   │   │
                  │   │  ┌──────────────────────┐  │   │   ...       │   │
                  │   │  │  codemation host     │  │   └─────────────┘   │
                  │   │  │  ├─ engine           │  │                     │
                  │   │  │  ├─ vetted nodes     │  │  ┌─────────────┐    │
                  │   │  │  │   (use SDKs       │  │  │  Tenant C   │    │
                  │   │  │  │    directly)      │  │  │   ...       │    │
                  │   │  │  ├─ agent-written    │  │  └─────────────┘    │
                  │   │  │  │   custom nodes    │  │                     │
                  │   │  │  ├─ collections /    │  │                     │
                  │   │  │  │   binary store    │  │                     │
                  │   │  │  ├─ Coding Agent     │  │                     │
                  │   │  │  │   (MCP)           │  │                     │
                  │   │  │  └─ per-tenant DB    │  │                     │
                  │   │  │     (encrypted)      │  │                     │
                  │   │  └──────────────────────┘  │                     │
                  │   └─────────────┬──────────────┘                     │
                  │                 │                                    │
                  └─────────────────┼────────────────────────────────────┘
                                    │
                          external APIs (Gmail, Slack, …)
                          via direct egress, using per-user tokens
                          (observed for billing/abuse, not policed)
```

## Trust model

```
What lives where, and what a leak gets you
──────────────────────────────────────────

Control plane only:
  - Codemation master OAuth apps (client_id + client_secret per provider)
  - KMS root keys, per-tenant DEKs
  - Billing / metering data
  - Managed AI / OCR provider keys
  - Concierge agent state

Tenant VM only:
  - That tenant's per-user OAuth access/refresh tokens
  - That tenant's collections, binaries, workflow definitions
  - That tenant's DB credentials (DB is firewalled, only this VM reaches it)
  - The coding agent and any agent-written custom nodes

Leak scenarios:
  - Tenant VM fully compromised → attacker has access to that tenant's
    own user data, which is what the platform was designed to access on
    that user's behalf. No cross-tenant impact (Firecracker isolation).
  - Master OAuth secret leaks → catastrophic, but it never leaves the
    control plane, which has standard hardening + secret rotation.
  - Cross-tenant leak → requires Firecracker escape (treated as
    defense-in-depth concern, not day-1 design).
```

## Two agents, two locations

```
┌─────────────────────────┐                    ┌────────────────────────┐
│   Concierge Agent       │ ◀──── chat ────▶   │   user                 │
│   (control plane,       │                    └────────────────────────┘
│    multi-tenant)        │
│                         │ ──── delegate(task, plan) ──┐
│   Tools:                │                             │
│   • clarify_intent      │                             ▼
│   • draft_plan          │                  ┌────────────────────────┐
│   • approve_plan        │                  │   Coding Agent (MCP)   │
│   • provision_install   │                  │   (per-installation)   │
│   • connect_oauth       │                  │                        │
│   • delegate_to_coding  │                  │   Tools:               │
│   • upgrade_tier        │                  │   • read_file          │
└─────────────────────────┘                  │   • write_file         │
                                             │   • grep / find        │
                                             │   • run_tests          │
                                             │   • create_node        │
                                             └───────────┬────────────┘
                                                         │
                                                         ▼
                                             writes to installation FS,
                                             engine hot-reloads
```

- **Concierge** is the only thing the user talks to. Lives in control plane.
  Never touches a tenant filesystem directly. Emits a typed plan; on approval,
  delegates code changes to the per-installation coding agent.
- **Coding agent** runs inside the tenant VM (counts toward their compute tier).
  Has access to the workspace, can write nodes, run tests. Operates within the
  framework's regulated coding patterns — that's why the framework is code-first.

## Same nodes, two modes — the credential seam

```
node code (identical in both modes)
────────────────────────────────────
const client = await ctx.credentials.gmail();
await client.messages.send({ … });

           │
           ▼
   CredentialResolver (interface in core)
           │
   ┌───────┴────────┐
   ▼                ▼
SelfHostedResolver   ManagedResolver
returns:             returns the same kind of client,
  GmailClient with    but with tokens that arrived from
  tokens stored in    the control-plane token-delivery
  the host's own DB   channel rather than from a user-
                      registered OAuth app
```

- Self-hosted: developer registers their own OAuth app, stores tokens in
  their host's DB, resolver returns clients backed by those tokens.
- Managed: control plane runs the OAuth dance with Codemation's master app,
  ships tokens into the tenant's vault, resolver returns clients backed
  by those tokens. Same SDK, same client, same node code.

This is the only architectural seam between modes. No `if (managed)` branches
anywhere else.

## Managed AI / OCR

```
┌───────────────────┐      ┌────────────────────┐      ┌──────────────┐
│ "AI Assistant"    │ ───▶ │  Managed Gateway    │ ───▶ │ Anthropic /  │
│ node in flow      │      │  (control plane)   │      │ OpenAI / …   │
│   model: "fast"   │      │  - meters tokens   │      └──────────────┘
│   prompt: …       │      │  - rotates keys    │
└───────────────────┘      │  - audit trail     │
                           └────────────────────┘
```

- Managed-only nodes (`AI Assistant`, `Document Scanner`, etc.) ship in
  `@codemation/core-nodes-managed`, only registered when the host detects
  a signed managed-mode claim in its boot config.
- Self-hosted users continue to use provider-specific nodes (Anthropic,
  Azure OCR, MyOrg OCR, etc.) directly. No silent no-op degradation.
- Metering at the gateway is non-tamperable. Self-reported metering from
  inside a tenant VM is not trusted for billing.

## Tiers

| Tier      | Compute                                                                 | Isolation                      |
| --------- | ----------------------------------------------------------------------- | ------------------------------ |
| Shared    | Small Firecracker VM packed densely on shared hosts; oversubscribed CPU | Per-tenant Firecracker microVM |
| Dedicated | Guaranteed Firecracker VM with reserved CPU/mem on dedicated hosts      | Per-tenant Firecracker microVM |

**Same security architecture for both tiers.** "Shared" only means smaller VM
specs and host-level packing — never multiple tenants per VM. The codemation
host itself is identical across tiers; the scheduler decides placement.

The 2k-leads-per-day mailbox case = dedicated. Most users = shared.

## What's day-1 vs deferred

### Day 1 (the MVP)

1. **`CredentialResolver` interface in `core`** + the existing self-hosted
   implementation refactored behind it.
2. **Control-plane OAuth endpoints** for the first 2–3 providers (Google,
   Microsoft, Slack), running the dance with Codemation's master apps.
3. **Token-delivery channel** from control plane into a tenant's encrypted
   vault. Authenticated, signed, one-way.
4. **Provisioner** that places one Firecracker VM per tenant, hands it
   its boot JWT and token vault credentials.
5. **Per-tenant DB encryption** with KEKs in control-plane KMS.
6. **Concierge agent** in control plane (intent → plan → approval →
   provision/connect/delegate).
7. **Coding agent (MCP)** per-installation with the regular framework
   coding tools.
8. **Plan-as-typed-artifact** schema and approval flow. Render-from-plan
   summaries in the UI; persist the approved plan with the workflow.
9. **Managed AI / OCR gateway** with metering, plus the corresponding
   `core-nodes-managed` package gated by managed-mode boot claim.

### Deferred (can ship without on day 1)

- **Per-tenant per-provider rate limiter** (defense against burning
  Codemation's master OAuth quota). Real concern, not urgent — handle
  with anomaly detection and manual throttling first; add the limiter
  middleware when we see actual abuse.
- **Outbound abuse signals** (Spamhaus-style pre-send checks).
- **Dedicated egress IP pools** per provider.
- **Strict-mode opt-in** where unapproved destinations actually fail
  at runtime instead of being logged.
- **Capability gating as a runtime security boundary** (the plan-approval
  flow is the consent layer; promoting it to a runtime enforcement layer
  is a future hardening pass, not day-1).

## Open questions to revisit

These were flagged but deferred during the design conversation:

- **Rate-limit / quota abuse design.** A tenant can burn Codemation's
  master OAuth app quota or get the app suspended. Day-1 mitigation:
  anomaly detection + volume caps + honor `Retry-After`. Real fix:
  per-tenant per-provider rate limiter middleware around vetted node
  SDK calls. Decide when first abuse is observed.
- **Plan schema.** What fields make `capabilities[]`, `data_flows[]`,
  `external_destinations[]` actually load-bearing for the UI without
  becoming a brittle DSL.
- **Audit log transport.** Append-only stream from VM to control plane
  for billing disputes and incident response. Likely a sidecar or
  signed batched POST.
- **Tenant offboarding.** Destroy the per-tenant DEK, VM image, and
  vault entries. Verify the OAuth tokens are also revoked at the
  provider (best-effort, not all providers expose revoke endpoints).
- **Migration path for existing self-hosted users** who later want to
  move to managed (or vice versa). Likely export/import of credential
  refs + workflow definitions; tokens cannot be migrated and must be
  re-authorized.
- **Region routing.** Single control plane, multi-region data plane.
  How does the concierge agent route to the right region for a given
  tenant; what's the failover story.

## Anti-decisions (things we explicitly chose _not_ to do)

Recording these so they don't come back uninvited:

- **No SDK wrapping per provider.** Vetted nodes use real SDKs.
- **No egress proxy for credential injection.** Tokens travel into the
  VM and the VM calls providers directly.
- **No deny-by-default egress.** Users automate arbitrary APIs.
- **No worker_thread sandbox / capability-gated `ctx` proxy** for
  agent-written nodes. The Firecracker VM is the boundary; in-VM
  isolation tiers add complexity without buying anything.
- **No Codemation-as-fake-OAuth-provider** broker layer. Earlier
  considered as a way to give each installation unique OAuth-like
  credentials; superseded by the simpler n8n-style "tokens shipped
  into the vault" model once Firecracker isolation was committed to.
- **No multiple tenants per VM**, even on shared tier.
- **No `if (managed)` branches in core.** Resolver swap only.
