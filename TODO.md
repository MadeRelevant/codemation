* [x] use tsyringe instead of cheap createSimpleContainer()
* [x] tighten typings and generics so consumers and library/core nodes allways get actual properties based on node input/output schemas which can be tight 100% when don correctly from the start
* [x] let the frontend handle all the heavy lifting of spinning up the UI, http server etc but allow consumers to hook into this so they can provide custom routes easily
* [x] ~move core/src/ai.ts to core-nodes/ai-agent~ clean up engine
* [x] split workflow setup into separate service instead of within engine
* [x] remove the service locator behaviour from the context factory, either set those at the factory or let classes just inject the required services
* [ ] add infinite recursion protection
* [ ] add tests what happens when aggregating items or vice versa (splitting items) and check paired items dont get messed up
* [x] support binary data
* [x] build webhook node
* [x] add oauth flows for credentials
* [ ] allow array of nodes in then() for parallelism
* [ ] support human-in-the-loop node
* [x] store a snapshot of the config at each run and build the canvas from that snapshot for historical views
* [x] split RunRouteHandler
* [x] Fix naming for PersistedWorkflow*
* [ ] Fix icon resolver, currently its using hardcoded map/if
* [ ] Fix datetime formatting, use battle tested library instead
* [ ] Allow binary uploads to webhook nodes
* [ ] (LLM) Observability
* [x] Rehome packages/host/ui -> packages/next-host (UI lives under `packages/next-host/src/features`, `src/components`, `src/shell`, `src/providers`)
* [x] Add signature token to sign credential values
* [x] Split up UI components into smaller components
* [x] **Design system (next-host)** — detailed checklist in Cursor plan `design_system_migration_8f27a4f3`; verification + inventory in [packages/next-host/docs/TAILWIND_SHADCN_MIGRATION.md](packages/next-host/docs/TAILWIND_SHADCN_MIGRATION.md)
    * [x] Credentials internals: `credential-dialog__*` / `credentials-table__*` → shadcn Input/Table/Badge + tokens (`CredentialDialogFormSections`, `FieldRows`, `CredentialsScreenInstancesTable`, …)
    * [x] Workflow detail: layout → inspector → canvas → realtime (`src/features/workflows/screens`, `components/workflowDetail`, `components/canvas`, `hooks/realtime`)
    * [x] Shared widgets: `CodemationDataTable`, `PasswordStrengthMeter`, … + `cn()`
    * [x] Purge `app/globals.css` legacy + bridge when unused; optional dark toggle
    * [x] Light verify: `pnpm --filter @codemation/next-host lint` + `pnpm run test:ui`; full `pnpm test` for CI/pre-merge only
* [ ] Setup dashboard
    * [ ] Show LLM analytics
    * [ ] Show workflow analytics (succeeded, failed, avg duration, avg token usage)
    * [ ] Show recent workflow runs
* [ ] Support white-label (logo + company name)
* [x] Migrate RouteHandlers from frontend to nextjs layer and call commands/queries directly and remove custom annotation driven router
* [x] Add "clear data" to the live workflow so you can run it cleanly instead of manually clicking play on first node -> then last node play button or "Run workflow"
* [x] Audit ESLint intentional relaxations so we are not quietly bypassing architecture rules: inventory `files` / `ignores` overrides in `tooling/eslint-config/index.mjs` (e.g. `codemation/no-manual-di-new` / `no-static-methods` off for specific paths), plus any `eslint-disable` in source; decide keep vs refactor vs narrow scope, and document rationale next to each override.
* [ ] Test credentials using Azure Keyvault instead of database
* [ ] Support retry policy (default X times with fixed delay and exponential as alternative)
* [ ] Support copy/paste between different live workflow instances (easy debugging prod inside dev)
* [x] Organize workflows by folder based on src
* [ ] Allow setting global GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET so oauth connections are easier
* [ ] Use actual urls for different canvas states so runs can be shared
* [ ] Organize CLI commands into their own file and let @injectAll() discover commands abd test consumers can add CLI commands too this way
* [ ] Refactor ConsumerOutputBuilder, try and find a battle tested solution
* [ ] Uyse better algorithm to visualize nodes as an agent within an if branch overlaps other nodes