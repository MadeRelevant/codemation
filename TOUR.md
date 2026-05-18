# Codemation — Tour de Grande

> A 10-minute walkthrough of the two repos. Start at the top, zoom in where the
> conversation goes. Each section is self-contained.

---

## 0. One-sentence pitch

**Codemation is a code-first automation framework** (think n8n / Zapier, but TypeScript-native)
plus a **managed control plane** that puts a chat-first UX on top so non-technical users
can describe an automation and have an AI agent write the workflow code inside their
own isolated VM.

Two repos:

| Repo             | Role                                                            | License                          |
| ---------------- | --------------------------------------------------------------- | -------------------------------- |
| `framework/`     | Engine, nodes, host, CLI, canvas — what runs the automation     | OSS-ish (pre-1.0 non-commercial) |
| `control-plane/` | Tenants, workspaces, OAuth broker, concierge agent, provisioner | Closed source                    |

---

## 1. Big picture (full stack)

```
  USER (browser)
       │  chat / canvas / workspace UI
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        CONTROL PLANE  (control-plane repo)           │
│                  Hetzner, single region, multi-tenant                │
│                                                                      │
│  customer-ui     concierge-api      api          admin-ui            │
│  Next.js         Hono + SSE         Hono REST    Next.js             │
│  shadcn+RHF      Concierge Agent    Workspace,   MCP servers /       │
│                  (Claude Sonnet)    Billing,     OAuth apps mgmt     │
│                                     OAuth broker                     │
│        \              │                /                             │
│         \             │               /                              │
│          ▼            ▼              ▼                               │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  packages/   domain · application (CQRS) · infrastructure     │    │
│  │              shared (Zod schemas, shared by API + UI)         │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  OAuth Broker: master OAuth apps (Google/MS/Slack). Client secrets   │
│  NEVER leave the control plane.                                      │
│                                                                      │
│  Gitea: one repo per workspace — push to main = deploy.              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Helm apply (one chart per workspace)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              DATA PLANE  (k8s + Firecracker microVMs)                │
│                                                                      │
│  services/cluster-controller (Go) — watches pending workspaces,      │
│    applies Helm, reports ready                                       │
│                                                                      │
│  ┌────────────────────────────┐  ┌────────────────────────────┐      │
│  │  Workspace A — microVM     │  │  Workspace B — microVM     │      │
│  │  ┌──────────────────────┐  │  │   ...                       │      │
│  │  │  @codemation/host    │  │  └────────────────────────────┘      │
│  │  │  ├─ engine           │  │                                       │
│  │  │  ├─ vetted nodes     │  │  Every workspace = own VM             │
│  │  │  ├─ per-WS Postgres  │  │  Hardware-isolated tenant boundary    │
│  │  │  └─ MCP server       │  │                                       │
│  │  │     (coding-agent    │  │                                       │
│  │  │      tools)          │  │                                       │
│  │  └──────────────────────┘  │                                       │
│  └────────────────────────────┘                                       │
└──────────────────────────────────────────────────────────────────────┘
                    │
          external APIs (Gmail, Slack, MS Graph, …)
          per-user OAuth tokens stored in the VM
          master OAuth secrets NEVER enter VMs
```

**Two agents, two scopes:**

```
CONTROL PLANE                         DATA PLANE (per workspace)
─────────────────────                 ──────────────────────────
Concierge Agent (concierge-api)       Coding Agent  (host MCP server)
  multi-tenant, 1 session/user          per-workspace, in microVM
  tools: auth, workspace, creds,        tools: read_file, write_file,
         workflows, delegation                 create_node, run_tests,
         (→ invoke_coding_agent)               list_workflows, reload
  NEVER touches filesystem              NEVER talks to other workspaces
```

---

## 2. Framework repo at a glance

```
framework/
├── packages/
│   ├── core/              ◀── ENGINE. Must stay pure (no HTTP, UI, SDKs).
│   │                          Workflow DSL, execution model, contracts.
│   ├── core-nodes/        ◀── Built-in nodes (AIAgent, CronTrigger, If,
│   │                          Split, Filter, HttpRequest, MapData…).
│   ├── core-nodes-gmail/  ◀── Plugin package style (relaxed DI rules).
│   ├── core-nodes-msgraph/    Thin SDK wrappers, grouped by API surface.
│   ├── core-nodes-ocr/        ← NEW (current branch)
│   │
│   ├── host/              ◀── The server. Hono gateway, Prisma,
│   │                          DI container (tsyringe), auth (Better Auth),
│   │                          credentials, run lifecycle.
│   ├── next-host/         ◀── Next.js UI shell on top of host.
│   ├── managed-auth/      ◀── Managed mode auth glue (vs self-hosted)
│   │
│   ├── canvas/            ◀── Workflow canvas UI component
│   ├── cli/               ◀── `codemation dev`, scaffolding, build
│   ├── create-codemation/ ◀── `npm create codemation@latest`
│   └── eventbus-redis/    ◀── Production EventBus impl
│
├── apps/
│   ├── test-dev/          ◀── Consumer-style smoke app for local dev
│   ├── e2e/  plugin-dev/  prove-packaged-auth-fix/  docs/
│
└── tooling/  (vitest configs, eslint config, tsconfig, codemods, …)
```

### The architectural rule that drives everything

```
┌─────────────┐  depends on   ┌──────────────┐
│ core-nodes  │ ────────────▶ │     core     │   ← pure engine
└─────────────┘                └──────────────┘
       ▲                              ▲
       │ depends on                   │ depends on
       │                              │
┌─────────────┐                ┌──────────────┐
│    host     │ ──────────────▶│   (engine)   │
└─────────────┘   uses engine  └──────────────┘
       ▲
       │ depends on
┌─────────────┐
│ next-host   │   ← Next.js UI; thin wrapper over host
└─────────────┘
```

- **core never imports nodes** — adding a node package never edits core.
- **host owns auth, persistence, HTTP** — UI shell stays thin.
- Per-package subpath exports (`@codemation/host/server`, `/client`, `/persistence`, …)
  keep server-only code (Prisma, Hono) out of browser bundles.

---

## 3. Framework — the workflow DSL (the "code-first" part)

A workflow is just TypeScript. This is the file in `apps/test-dev/` that drives our
Gmail smoke:

```ts
// apps/test-dev/src/workflows/gmail-agent-smoke/gmail-agent-smoke.ts
import { AIAgent, CronTrigger, createWorkflowBuilder } from "@codemation/core-nodes";

export default createWorkflowBuilder({
  id: "wf.sprint2.gmail-agent-smoke",
  name: "Sprint 2 smoke: cron → agent → Gmail MCP",
})
  .trigger(new CronTrigger("Every minute", { schedule: "* * * * *", timezone: "UTC" }))
  .then(
    new AIAgent({
      name: "Gmail reader",
      messages: [
        /* system + user prompt */
      ],
      chatModel: openAiChatModelPresets.demoGpt4oMini,
      mcpServers: ["gmail"], // ← resolved via control plane registry
      guardrails: { maxTurns: 5 },
    }),
  )
  .build();
```

The DSL also has `.map(item, ctx)`, `.if(...)`, `.switch({ resolveCaseKey })` — the
**callback shape is per-item**, even though the engine activates nodes in batch shape.

### Engine ↔ node contract (the one slide that prevents bugs)

```
Activation:        Items on `main`   (always batch-shaped)
                          │
              ┌───────────┴─────────────┐
              ▼                         ▼
       Batch node                 Per-item node  ◀── 95% of nodes
   (Split, Filter,                (ItemNode / executeOne)
   Aggregate)                     - inputSchema (Zod) validates item.json
   - controls its own              - itemExpr resolves per-item config
     iteration                     - returns the OUTPUT PAYLOAD, not
                                     {...input, result: x}
                                   - bytes go on item.binary via
                                     ctx.binary.attach (never base64 in json)
```

That last point — `item.json` is the **output payload**, binaries go on
`item.binary` — is the most-corrected mistake in code review.

---

## 4. Control plane repo at a glance

```
control-plane/
├── apps/
│   ├── customer-ui/      ◀── Next.js — chat, canvas embed, workspace mgmt
│   ├── api/              ◀── Hono REST — workspace CRUD, creds, billing
│   ├── concierge-api/    ◀── Hono + SSE — concierge agent sessions
│   ├── admin-ui/         ◀── Next.js — admin MCP / OAuth app mgmt
│   ├── workspace-mcp/    ◀── MCP server for workspace runtime
│   ├── host-mcp/         ◀── MCP bridge to host
│   ├── cli/              ◀── operator CLI
│   └── ui/  admin/       ◀── shared UI shells
│
├── services/
│   └── cluster-controller/   ◀── Go. Firecracker provisioner. Watches
│                                  pending workspaces via Postgres
│                                  LISTEN/NOTIFY. Region-aware.
│
├── packages/
│   ├── domain/           ◀── Aggregates, repo interfaces (IFooRepository),
│   │                          PolicyVoter, domain events. Pure.
│   ├── application/      ◀── CQRS — Command/Query bus + handlers
│   ├── infrastructure/   ◀── Prisma, Better Auth, in-memory impls, HTTP utils
│   ├── shared/           ◀── Zod schemas shared by API + UI
│   └── testkit/
│
└── tooling/   (eslint with 3 critical DI rules, tsconfig)
```

### The pattern (it's the same everywhere)

```
WRITE                              READ
─────                              ────
Route handler                      Route handler
  → Zod parse body                   → Zod parse params
  → new XCommand(body)               → new XQuery(params)
  → commandBus.execute()             → queryBus.execute()
  → @HandlesCommand                  → @HandlesQuery
  → XCommandHandler                  → XQueryHandler
  → repository.save()                → repository.find()

AUTH                               AUTHZ (after resource loaded)
────                               ─────────────────────────────
SessionVerifier                    accessDecisionManager
  .verify(request)                   .canOrThrow(principal, 'write', ws)
  → principal | null                 → throws 403 if denied
  → 401 if null
```

### Code snippet — a command handler (concrete example)

```ts
// control-plane/packages/application/src/oauth/CreateOAuthAppCommandHandler.ts
@HandlesCommand.forCommand(CreateOAuthAppCommand)
export class CreateOAuthAppCommandHandler extends CommandHandler<CreateOAuthAppCommand, OAuthApp> {
  constructor(
    @inject(ApplicationTokens.OAuthAppRepository)
    private readonly oauthApps: IOAuthAppRepository,
    @inject(OAuthAppFactory)
    private readonly factory: OAuthAppFactory,
  ) {
    super();
  }

  async execute(command: CreateOAuthAppCommand): Promise<OAuthApp> {
    const app = this.factory.reconstruct(
      crypto.randomUUID(),
      command.key,
      command.displayName,
      command.description,
      command.provider,
      command.clientId,
      command.clientSecret,
      command.scopesAllowed,
      new Date(),
      new Date(),
      command.authUrl,
      command.tokenUrl,
    );
    await this.oauthApps.save(app);
    return app;
  }
}
```

Note:

- DI via `@inject` (tsyringe). No manual `new` outside composition roots — ESLint enforces.
- Repo **interface** lives in `domain`, **implementation** in `infrastructure`.
- This handler can be swapped from in-process to HTTP without changing the route or the handler — just swap `InMemoryCommandBus` for `HttpCommandBus`.

---

## 5. End-to-end: "Connect my Gmail and save invoices to a Sheet"

```
1. User signs up
      → customer-ui (Next) authenticates via Better Auth
      → Concierge greets in chat

2. "Set up an environment"
      → concierge-api invokes provision_workspace tool
      → command bus → CreateWorkspaceCommand
      → row inserted as pending
      → cluster-controller (Go) sees LISTEN/NOTIFY
      → Helm apply → Firecracker microVM boots @codemation/host
      → installation reports ready, gets installationJwt

3. "Connect my Gmail"
      → concierge tool: generate_oauth_url
      → user clicks → Google OAuth dance happens IN THE CONTROL PLANE
        (master client_id/secret never leave control plane)
      → access/refresh tokens posted to workspace VM via
        installationJwt-gated endpoint
      → tokens stored in workspace's per-tenant credential store

4. "When I get an invoice email, save attachment to a Sheet"
      → Concierge produces a TYPED PLAN (Zod-validated)
      → user approves
      → Concierge delegates to Coding Agent (MCP server in VM)
      → Coding Agent writes a workflow .ts file using the DSL above
      → git push to workspace's Gitea repo
      → host hot-reloads .codemation/output
      → workflow live; cron / webhook / etc starts firing

5. Runs visible on the embedded canvas, activity feed shows item-by-item
   execution streamed via Redis Streams → WebSocket.
```

**The security punchline:**

```
┌───────────────────────────┐         ┌──────────────────────────────┐
│  Control plane            │         │  Workspace VM                │
│  ───────────────          │         │  ─────────────                │
│  Master OAuth secrets ────┼── OAuth ┤  per-user tokens (fine, it's  │
│  (Codemation's apps)      │  dance  │  the user's own VM)          │
│                           │         │                              │
│  Multi-tenant             │         │  Single-tenant, Firecracker- │
│  Hardened, audited        │         │  isolated, user can do       │
│                           │         │  whatever inside it          │
└───────────────────────────┘         └──────────────────────────────┘
```

---

## 6. Where to zoom in next (pick one)

| If they ask about…                       | Open this                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| The engine / how a workflow runs         | `packages/core/src/execution/` and `runtime/`                          |
| The node contract (Items, ports, binary) | `AGENTS.md` §"Engine ↔ Node contract"                                  |
| How forms / UI are built                 | `packages/next-host/docs/FORMS.md` (RHF + Zod)                         |
| Auth model                               | `docs/better-auth-host.md`                                             |
| Multi-tenancy / isolation                | `epic-planning/00-big-picture.md` (this file's source)                 |
| OAuth broker design                      | `epic-planning/05-oauth-broker.md`                                     |
| Provisioner / Firecracker                | `epic-planning/07-provisioner.md` + `services/cluster-controller` (Go) |
| Concierge agent                          | `epic-planning/08-concierge-agent.md`                                  |
| CQRS / DDD layout                        | `control-plane/packages/{domain,application,infrastructure}`           |

---

## 7. Conventions worth name-dropping

- **pnpm + Turborepo monorepo**, **tsdown** for libs, **Vitest** for tests
- **tsyringe** DI everywhere; 3 ESLint rules enforce it (no manual `new`, no `static`,
  no exported free functions outside `*Factory.ts` / `*Builder.ts` / `*Registry.ts` /
  `*.types.ts` files)
- **One class per file** (with named exceptions)
- **No mocks** if a real in-memory implementation exists. Engine tests run the real engine.
- **Changesets** mandatory on every publishable package change
- **Two Prisma schemas** in the host (Postgres + SQLite) kept in lockstep — both
  migrations required per change
- **All bytes go through `ctx.binary`** — never base64 in `item.json`
