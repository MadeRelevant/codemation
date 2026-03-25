# Codemation TODO

Open items first; completed work is archived at the bottom for history.

## Open

### Engine & workflow execution

- [x] Add infinite recursion protection (directed cycle rejection, activation budget, subworkflow depth limits — see `packages/core/test/engine.*` hardening tests)
- [ ] Allow an array of nodes in `then()` for parallelism
- [ ] Support human-in-the-loop node
- [x] Implement pruning policy
- [ ] Fully test subworkflow execution + visualization
  - [ ] Introduce explicit "When invoked by other workflow" trigger node so its clear and easy to reason about the start node when invoking a subworkflow
- [ ] Allow setting agent max turns, max tokens, max tool calls, tool call parallelism
- [x] Lock when "not to continue", when no items are emitted for example and allow users to continue anyway even when items are empty
- [ ] Implement leader election logic so triggers and pruners are only started once
- [x] Remove the "register webhook" logic, webhooks must be scaleable by endpoint and just resolve the workflow once and then execute the "webhook" trigger
- [ ] Only start triggers for workflows that are "activated"
- [ ] Organize tests better (currently core has 1 big flat list)
- [ ] Let nodes define inputs, triggers wont have any, this way we can render them correctly too on the canvas. Currently they are rendered as if they would allow an incoming connection
- [ ] Periodically clean up credential bindings for nodes that dont exist in code anymore (low prio)
- [ ] Stress test webhook and measure cpu/mem and make sure they dont run out
- [ ] Add Switch node for easy branching
- [ ] Add documentation project

### UI, URLs & sharing

- [ ] Support copy/paste between different live workflow instances (e.g. debug prod inside dev)
- [ ] Fix icon resolver (replace hardcoded map / `if` chain)
- [ ] Fix datetime formatting (use a battle-tested library)
- [ ] Use a better layout algorithm when an agent node sits inside an `if` branch and overlaps other nodes

### Dashboard & product

- [ ] Setup dashboard
  - [ ] LLM analytics
  - [ ] Workflow analytics (succeeded, failed, avg duration, avg token usage)
  - [ ] Recent workflow runs
- [ ] Support white-label (logo + company name)

### Integrations & observability

- [ ] Allow binary uploads to webhook nodes
- [ ] (LLM) Observability (cross-cut with dashboard LLM analytics)
- [ ] Test credentials backed by Azure Key Vault instead of database

### CLI

- [ ] Organize CLI commands into dedicated modules and let `@injectAll()` discover commands; allow test consumers to register CLI commands

---

## Completed

### Engine, core & nodes

- [x] Use tsyringe instead of cheap `createSimpleContainer()`
- [x] Tighten typings and generics so consumers and library/core nodes get actual properties from node input/output schemas when defined correctly from the start
- [x] Let the frontend own spinning up UI, HTTP server, etc., with hooks so consumers can add custom routes easily
- [x] Move `core/src/ai.ts` to core-nodes / clean up engine
- [x] Split workflow setup into a separate service instead of inside the engine
- [x] Remove service-locator behavior from the context factory (set at factory or inject dependencies)
- [x] Aggregating/splitting + paired-item regression tests — **not pursued** by design: code-first TypeScript and batch `items`; stable correlation is explicit userland (ids/keys)
- [x] Support binary data
- [x] Build webhook node
- [x] Add OAuth flows for credentials
- [x] Store a config snapshot per run and build the canvas from it for historical views
- [x] Split `RunRouteHandler`
- [x] Fix naming for `PersistedWorkflow*`
- [x] Add signature token to sign credential values
- [x] Support retry policy (default N times with fixed delay; exponential as an option)
- [x] Organize workflows by folder based on `src`
- [x] Allow global `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` for easier OAuth

### Host & Next

- [x] Rehome `packages/host/ui` → `packages/next-host` (UI under `packages/next-host/src/features`, `components`, `shell`, `providers`)
- [x] Migrate route handlers from frontend to the Next layer; call commands/queries directly; remove custom annotation-driven router
- [x] Add “clear data” on the live workflow for clean runs without manual node-by-node play
- [x] Refactor `ConsumerOutputBuilder` toward a battle-tested approach
- [x] Use real URLs for canvas and live/historical runs so views and runs are shareable (`run`, `pane`, `node` query params; `WorkflowDetailUrlCodec`)

### UI / design system

- [x] Split UI into smaller components
- [x] **Design system (next-host)** — plan `design_system_migration_8f27a4f3`; details in [packages/next-host/docs/TAILWIND_SHADCN_MIGRATION.md](packages/next-host/docs/TAILWIND_SHADCN_MIGRATION.md)
  - [x] Credentials internals: `credential-dialog__*` / `credentials-table__*` → shadcn Input/Table/Badge + tokens (`CredentialDialogFormSections`, `FieldRows`, `CredentialsScreenInstancesTable`, …)
  - [x] Workflow detail: layout → inspector → canvas → realtime (`src/features/workflows/screens`, `components/workflowDetail`, `components/canvas`, `hooks/realtime`)
  - [x] Shared widgets: `CodemationDataTable`, `PasswordStrengthMeter`, … + `cn()`
  - [x] Purge `app/globals.css` legacy + bridge when unused; optional dark toggle
  - [x] Light verify: `pnpm --filter @codemation/next-host lint` + `pnpm run test:ui`; full `pnpm test` for CI/pre-merge only

### Tooling & quality

- [x] Audit ESLint intentional relaxations: inventory `files` / `ignores` in `tooling/eslint-config/index.mjs` and `eslint-disable` in source; document rationale per override
