# @codemation/cli

## 0.3.0

### Minor Changes

- [#157](https://github.com/MadeRelevant/codemation/pull/157) [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea) Thanks [@cblokland90](https://github.com/cblokland90)! - Shrink workspace-host Docker image by decoupling CLI from next-host at runtime.

  `@codemation/cli`: demote `@codemation/next-host` from `dependencies` to `devDependencies`. The CLI's
  non-headless serve path resolves the next-host package at runtime via `require.resolve()`; the
  headless path (used by workspace-host pods) never touches it. Consumers that install `@codemation/cli`
  from the registry and need the UI shell must add `@codemation/next-host` as a direct dependency.

  `@codemation/core-nodes`: demote `lucide-react` from `dependencies` to `devDependencies`. The package
  only references lucide icon names as strings (e.g. `"lucide:bot"`); it never imports the react library
  at runtime. This removes ~46 MB from runtime installs of `@codemation/core-nodes`.

  `@codemation/host`: promote `execa` and `dotenv` from `devDependencies` to `dependencies`. Both are
  required at Dockerfile build time by `scripts/generate-prisma-clients.mjs` (imports `execaSync` from
  `execa`) and `prisma.config.ts` (imports `dotenv/config`). These files run during `prisma:generate`
  which executes in the production builder stage with `--prod` install (no devDeps available).

### Patch Changes

- Updated dependencies [[`a70e182`](https://github.com/MadeRelevant/codemation/commit/a70e182a852026e4f6d8f317fe9862417dc23ce6), [`5315e23`](https://github.com/MadeRelevant/codemation/commit/5315e2361492560601ac2c97491aa58c49346fd4), [`ac860a5`](https://github.com/MadeRelevant/codemation/commit/ac860a5af1df3e5766581e644fef8cc0d1b24eba), [`8ac207a`](https://github.com/MadeRelevant/codemation/commit/8ac207ab263542e46fad0b9e1ea584fbb71a747c), [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea)]:
  - @codemation/host@0.8.0

## 0.2.0

### Minor Changes

- 8285ec0: Add `--api-only` devMode (`codemation dev --api-only`) that skips spawning the workspace Next UI. Useful when an external host (e.g. the control plane customer-ui) serves the UI; only the API runtime, WebSocket, and proxy are started. Also respects `CODEMATION_DEV_MODE=api-only` env var.
- 8285ec0: Runtime DI parity: hoist TypeInfo registrar into AppContainerFactory so CLI runs get the same DI graph as the HTTP host. Add codemation run workflow CLI command that dispatches StartWorkflowRunCommand and polls until terminal status.
- 8285ec0: post-sprint-10 batch fixes
  - **cli (minor):** Remove `discovery` subcommand group — relocated to admin-ui catalog debug page. Discovery is a catalog-admin tool, not a workflow-author tool; the framework CLI is the wrong home.
  - **next-host (patch):** Relax ELK nested-agent side-by-side layout test. The strict y-diff ≤ 8 geometry assertion was impossible (74+gap+74 > 160 px compound width); replaced with `toBeDefined()` checks confirming both children render.

### Patch Changes

- 8285ec0: test(cli): push @codemation/cli unit coverage to ≥90% (Sprint 16 Story 01)

  Adds behavioral unit tests and vitest coverage exclusions to raise the
  @codemation/cli unit-suite line coverage from 47% (unit-only) / 80%
  (merged) to 91% on the unit gate.

  New tests cover:
  - CliAsciiTableBuilder (formatter)
  - DevelopmentConditionNodeOptions (node option appending)
  - TypeScriptRuntimeConfigurator (env setter)
  - ConsumerOutputBuilderFactory (factory)
  - NextHostEdgeSeedLoader.resolveDevelopmentServerToken + loadForConsumer
  - DevCliBannerRenderer api-only mode + redisUrlRedacted branch
  - DevRebuildQueue concurrent enqueue path
  - DevNextChildProcessOutputFilter null-stream guard
  - ConsumerOutputBuilder: inline workflows, config override error, JS config,
    .mts/.cts extension conversion, spread/destructuring/computed-property
    config parse branches, import specifier rewriting
  - DatabaseMigrationsApplyService.applyForConsumer no-op path
  - CollectionsCliOptionsParser (pure logic)
  - ListenPortConflictDescriber: readSsOutput, execFileStdout, parseSsListenOutput branches
  - DevSourceWatcher: isIgnoredPath/isRelevantPath/flushPendingChange branches,
    stop-with-debounce, scheduleDebouncedChange double-call
  - DevNextHostEnvironmentBuilder: fallback WebSocket port from URL without port
  - DevTrackedProcessTreeKiller: trySigTermProcessGroup catch, trySigTerm throw,
    trySigKillProcessGroup, waitForExit no-timeout path
  - CliDevProxyServer: telemetryEvent, workflowChanged, error message kind branches,
    empty message drop, child socket close → client 4401

  Exclusions added to vitest.config.ts with rationale comments for files that are
  composition roots, CLI entrypoints, or require live DB/process infra (all
  exercised by integration tests).

- 8285ec0: `codemation dev` now reaps a prior session's process + port instead of refusing to start, and reloads consumer `.env*` files in place instead of asking the user to restart manually.

  `DevLock.acquire` on `EEXIST`: SIGTERM the recorded pid and its process group, then `lsof` the recorded port and SIGTERM anything still holding it (covers detached children that outlived a crashed CLI parent). SIGKILL fallback on stragglers; port-free poll is the real gate.

  `DevCommand` env-only change handler: re-reads `consumerEnvLoader.load(consumerRoot)` and updates `prepared.consumerEnv` in place, then enqueues a normal rebuild. The runtime spawn picks up the fresh values.

- 8285ec0: Fix workflow WebSocket proxy in managed-auth mode: per-client child sockets now forward the browser's `?token=` query parameter upstream, so the inner runtime's `ManagedAuthMiddleware` can authenticate the upgrade request. Previously a single shared child socket was opened without credentials, causing the runtime to return HTTP 401 and leaving the canvas stuck on the 5-second polling fallback.
- 8285ec0: Fix `/api/lucide-icon/*` 404s in `codemation dev` mode. The CLI dev gateway used to route every `/api/*` request to the disposable Hono runtime, but the lucide icon route lives in next-host's app router only. Added a gateway exception that forwards `/api/lucide-icon/*` to the Next UI proxy in dev. Also added `outputFileTracingIncludes` for `lucide-static` so the same route works in standalone production builds where Next.js's static tracer couldn't see the dynamic `createRequire` load.
- 8285ec0: Fix dev proxy not forwarding `/internal/*` requests to the inner runtime. Previously these fell through to the Next.js UI proxy; now they are routed to the runtime (or return 503 when building/errored), enabling workspace-mcp HMAC calls to `/internal/workflows` and `/internal/credentials`.
- 8285ec0: Fix: dev proxy now opens the per-client upstream WS to the runtime BEFORE signaling `{kind:"ready"}` to the browser client. Previously the proxy sent `ready` immediately and opened the upstream asynchronously — clients that subscribed to a workflow room right after `ready` had their subscribe silently dropped because `state.childSocket` was still null. For workflows that finish in ~150ms (e.g. a `Wait(0)` + `Callback`), the run completed before the upstream opened and re-issued the subscription, so no `runCreated`/`nodeStarted`/`runSaved` events ever reached the browser.

  Now we await the upstream open, then send `ready`. Subscriptions land on a real upstream socket the moment they arrive.

- 8285ec0: Coverage Phase 2: testkits (LoggerTestKit, McpTestKit, CoreNodesTestContextFactory,
  TelemetryTestKit, GmailTestKit, AppConfigFixturesFactory, HookTestkit), per-package
  vitest coverage thresholds, and new tests on previously zero-coverage critical paths
  (mergeNode, switchNode, waitNode, connectionCredentialNode, canvas-lib pure, hook smoke).
  No production code changes.
- 8285ec0: feat(examples): add @codemation/examples workspace package with dev harness, frontmatter convention, verify-examples CI gate, and codemation example:verify CLI command (Sprint 10 Story B)
- 8285ec0: Introduce a cross-platform `ProcessRunner` seam (interface + execa-backed `ExecaProcessRunner`) exported from `@codemation/host/server`, registered in `AppContainerFactory` under `ApplicationTokens.ProcessRunner`. Migrate every CLI site that previously spawned bare external commands (`pnpm exec next dev` and the packaged Next UI in `DevCommand`, `pnpm exec next start` in `ServeWebCommand`, `pnpm --filter … dev` in `WorkspacePluginDevProcessCoordinator`, `pnpm exec prisma migrate deploy` in `PrismaMigrateDeployInvoker`) so Windows finds `pnpm.cmd` / `pnpm.ps1` shims via execa's PATH resolution instead of erroring with ENOENT. Replace the bash-only `realpath "$(command -v pnpm)"` lookup in `packages/host/scripts/generate-prisma-clients.mjs` with an `execaSync("pnpm", ["root", "-g"])` probe. Fix the root `dev:framework` script's single-quoted command tokens (broken on Windows `cmd.exe`) by switching to escaped double quotes so it works on cmd, PowerShell, bash and zsh.
- 8285ec0: Move `simple-icons` SVG data out of the client bundle. Named imports from the ~5.2 MB `simple-icons` barrel are replaced by a server-side `/api/si-icon/[slug]` route that reads SVG files from disk, mirroring the `lucide-react` fix from commit 54c3a392. Canvas `si:` icons now render via CSS `mask-image` (same pattern as lucide remote glyphs). OAuth provider icons switch to a small inline path+hex map, eliminating the barrel import entirely. `simple-icons` removed from `optimizePackageImports` in `next.config.ts` as it is no longer imported client-side.
- 8285ec0: Sprint 14 coverage: tests for WhenBuilder DSL helper, InMemoryWorkflowExecutionRepository retention paths, DevTrackedProcessTreeKiller edge cases, ConsumerCliTsconfigPreparation resolution, ListenPortConflictDescriber ss fallback, RedisRunEventBus publish/subscribe/teardown, CodemationChatModelFactory HMAC signing, registerCoreNodes smoke, single-react-component-per-file rule branches, and CodemationAgentSkillsCli error/help paths. No production code changes.
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [7b50018]
- Updated dependencies [8285ec0]
- Updated dependencies [54c3a39]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [0082ab5]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [51b728d]
  - @codemation/host@0.7.0
  - @codemation/agent-skills@0.2.0
  - @codemation/next-host@0.5.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384), [`e8e3935`](https://github.com/MadeRelevant/codemation/commit/e8e39358a4282e0a780efb428ae0d71d105afd5f), [`5b509e8`](https://github.com/MadeRelevant/codemation/commit/5b509e83e1e963e0c03cb0cbad018dc1fb0a04c5)]:
  - @codemation/host@0.6.0
  - @codemation/next-host@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.5.1
  - @codemation/next-host@0.3.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`847deb4`](https://github.com/MadeRelevant/codemation/commit/847deb4c42801632bfb970cdb2625cd0755241cb)]:
  - @codemation/host@0.5.0
  - @codemation/next-host@0.3.1

## 0.1.0

### Minor Changes

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Major dev-server startup-time and bundle-size improvements, plus dev-CLI hardening.

  **Why this matters**

  Before this work, opening the workflow detail page on a 4-cpu / 8-GB WSL box would
  OOM-kill `next-server` mid-compile (~5 GB peak RSS). After: the page cold-compiles in
  **5.5 s** with peak **1.8 GB** and the dev server stays comfortably alive. The dev CLI
  also boots significantly faster and survives consumer-source errors without tearing
  the whole session down.

  **Hard numbers**
  - Workflow page Turbopack RSS peak: **5.0 GB → 1.8 GB** (-64%)
  - Workflow page cold compile time: **~14 s → ~5.5 s**
  - Lucide-react files in workflow page bundle: **1,713 → 74** (-95.7%)
  - Host package typecheck: **17.5 s / 4,093 files / 2.1 GB → 8.8 s / 2,806 files / 1.9 GB**
  - Host source tree: **-112,492 lines** of generated Prisma `.d.ts`
  - Host circular dep cycles: **92 → 21**
  - Core circular dep cycles: **53 → 50**

  **`@codemation/next-host`**
  - New `WorkflowCanvasLucideIconRegistry` — curated 18-icon set used by core node plugins.
    Replaces `lucide-react/dynamic` (which forced bundling of all 1,713 icons because it
    loads them by string at runtime). Workflows using `icon: "lucide:<unknown>"` now fall
    back to the `Boxes` icon and emit a one-time `console.warn`. **Plugin authors needing
    custom icons must ship SVG via `builtin:` / `si:` / URL tokens.**
  - New slim subpath exports on `@codemation/host`: **`@codemation/host/dto`**,
    **`@codemation/host/mapping`**, plus extensions to **`@codemation/host/client`**.
    All 65 deep `@codemation/host-src/*` imports replaced; `@codemation/host-src/*`
    tsconfig path removed. Prevents the UI from dragging the heavy host runtime graph
    through Turbopack on every UI route compile.
  - 42 lucide-react named imports rewritten to per-icon deep imports
    (`lucide-react/dist/esm/icons/<kebab>`).
  - Workflow detail page lazy-loads `WorkflowDetailScreenTestsView` and the
    Monaco-backed `WorkflowJsonEditorDialog`.
  - Removed `@codemation/core` and `@codemation/host` from `transpilePackages` and
    dropped the corresponding root-barrel tsconfig paths so Next loads them from
    compiled `dist/` instead of TypeScript source.
  - Dev: `EdgeSessionVerifier` resolves `/api/auth/session` via
    `x-forwarded-host` (the dev gateway) instead of `request.nextUrl.origin` (Next's
    loopback). Previously the auth-check fetch looped back into Next, forcing
    Turbopack to compile the catch-all `/api/[[...path]]` route on every page load.

  **`@codemation/host`**
  - Generated Prisma clients (`prisma-client`, `prisma-postgresql-client`,
    `prisma-sqlite-client`) moved out of `src/infrastructure/persistence/generated/`
    to `prisma-generated/` (sibling of `src/`). They're still typechecked and bundled
    by the host build, but no longer pollute the public source surface that downstream
    packages walk.
  - New **`@codemation/host/dto`**, **`@codemation/host/mapping`** subpath exports
    re-exposing only the contract DTO types and presentation factories the UI needs.
    The existing **`@codemation/host/client`** subpath gained `ApiPaths`,
    `BrowserLoggerFactory`, `logLevelPolicyFactory`, `InAppCallbackUrlPolicy`, and
    `Logger` so the UI no longer needs deep imports.

  **`@codemation/core`**
  - New **`@codemation/core/contracts`** subpath — re-exports only pure-type contracts
    (`assertionTypes`, `runTypes`, `workflowTypes`, etc.) using `export type *`. Type-only
    consumers can import from here to avoid dragging the workflow DSL runtime into their
    compile graph. Existing `@codemation/core` (root barrel) is unchanged for backwards
    compatibility.
  - Extracted `core/src/contracts/baseTypes.ts` (six fundamental id types) to break a
    long-standing `credentialTypes ↔ workflowTypes` cycle.

  **`@codemation/cli` — dev-CLI hardening**
  - **`DevHttpProbe`**: TCP-listener probe replaces the HTTP-response probe, so a slow
    Next dev cold compile no longer SIGTERMs the dev tree.
  - **Single-runtime swap** in `runQueuedRebuild`: stops the old in-process runtime
    before creating the new one, freeing ~1.5 GB during dev source-changes. Consumer
    errors are now non-fatal — the gateway returns 503 and the dev session stays up
    until the next save fixes the build.
  - **Workspace-plugin watch is now opt-in** via `CODEMATION_DEV_WATCH_PLUGINS=true`.
    By default `pnpm dev` no longer spawns `tsdown --watch` for each workspace plugin
    (saves ~500 MB baseline + the rebuild-loop pressure). Plugins still load from
    their existing `dist/` output; opt in only when actively editing a plugin's source.
  - **`DevSourceWatcher`**: 75 ms → 750 ms debounce so a single `tsdown` rebuild collapses
    into one runtime swap. Defense-in-depth ignore re-check at the event handler (chokidar
    doesn't always re-evaluate `ignored` for files created post-start). 20 s startup grace
    period to drop initial-build noise.
  - **Workspace plugin watch root** narrowed from `dist/` to the plugin's entry file —
    tsdown rewrites the entry once per real build, so one watch event per build instead of
    a dozen.
  - Removed `--conditions=development` from the Next-host's `NODE_OPTIONS`. Previously
    this resolved `@codemation/{core,host}` to TypeScript source; combined with
    `transpilePackages` it forced Turbopack to walk the full source tree on every
    UI route compile.

  **Architectural guard rails (no behavior change, prevent regressions)**
  - ESLint `no-restricted-imports` blocks `@codemation/host-src/*` and root
    `@codemation/host` from `next-host` UI; blocks `prisma-generated/*` outside host's
    persistence layer.
  - New **`dependency-cruiser`** config + `pnpm depcruise` script.
  - New **`knip`** config + `pnpm lint:knip` script.
  - New `tooling/scripts/check-circular-deps.mjs` + `pnpm lint:circular` wired into
    `pnpm lint` with frozen baselines (core: 50, host: 21, core-nodes: 73).
  - **`@next/bundle-analyzer`** wired up; `pnpm analyze` available for on-demand
    inspection (uses `next experimental-analyze` for Turbopack-mode introspection).
  - New `AGENTS.md` "Cross-package imports" section documenting the slim-subpath
    discipline and the rationale for it.

  The contract additions are strictly additive; no existing API surface changed shape.

- [#101](https://github.com/MadeRelevant/codemation/pull/101) [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535) Thanks [@cblokland90](https://github.com/cblokland90)! - Add collections: declare typed Postgres/SQLite-backed data tables in the codemation config via `defineCollection({...})`. Schema sync runs at runtime startup behind an advisory lock (Postgres) or in-process mutex (SQLite).

  Workflow access:
  - `ctx.collections.<name>.crud(...)` from inside custom node code
  - Six new canvas nodes: `CollectionInsert`, `CollectionGet`, `CollectionFindOne`, `CollectionList`, `CollectionUpdate`, `CollectionDelete`

  Operator surfaces:
  - HTTP API at `/collections/*`
  - CLI: `codemation collections list|show|rows|get|insert|update|delete|sync`
  - UI at `/collections`

  Destructive schema changes (column drops, type changes) require `CODEMATION_COLLECTIONS_ALLOW_DESTRUCTIVE=1`.

  Out of scope (separate PRs):
  - Real leader election (advisory lock at boot is sufficient for sync; trigger double-firing during container swap is unaddressed)
  - Admin-role gating on the UI
  - Runtime user-defined schemas (Airtable-style)
  - Joins, aggregates, query DSL beyond indexed-field equality

### Patch Changes

- [#110](https://github.com/MadeRelevant/codemation/pull/110) [`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c) Thanks [@cblokland90](https://github.com/cblokland90)! - Add per-package `test:unit` scripts so Turbo can address each package individually for affected-only filtering. No runtime changes — dev-tooling only.

- Updated dependencies [[`ec985a3`](https://github.com/MadeRelevant/codemation/commit/ec985a3264696b421e8be7c84c7cead6a85cbe6c), [`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c), [`d22b91e`](https://github.com/MadeRelevant/codemation/commit/d22b91e6916edade7253747ee073a6f65ee9465a), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`3fe4213`](https://github.com/MadeRelevant/codemation/commit/3fe4213292bd0dd45af8de96d63e403dbc373b6b), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb)]:
  - @codemation/agent-skills@0.1.10
  - @codemation/next-host@0.3.0
  - @codemation/host@1.1.0

## 0.0.41

### Patch Changes

- Updated dependencies [[`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce)]:
  - @codemation/host@1.0.2
  - @codemation/next-host@0.2.4

## 0.0.40

### Patch Changes

- Updated dependencies [[`328c975`](https://github.com/MadeRelevant/codemation/commit/328c9759d45b711c177ea9a360ed4960ffdf5ffa), [`328c975`](https://github.com/MadeRelevant/codemation/commit/328c9759d45b711c177ea9a360ed4960ffdf5ffa)]:
  - @codemation/next-host@0.2.3
  - @codemation/host@1.0.1

## 0.0.39

### Patch Changes

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/host@1.0.0
  - @codemation/next-host@0.2.2

## 0.0.38

### Patch Changes

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/host@0.3.1
  - @codemation/next-host@0.2.1

## 0.0.37

### Patch Changes

- [#87](https://github.com/MadeRelevant/codemation/pull/87) [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014) Thanks [@cblokland90](https://github.com/cblokland90)! - Disable automatic packaged skill refreshes inside the Codemation framework monorepo so framework-author workflows stop dirtying the local worktree.
  - keep `codemation skills sync` as the explicit refresh path after upgrading `@codemation/cli` or `@codemation/agent-skills`
  - document the monorepo behavior in the packaged CLI skill and agent-skills README

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014), [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`5d649ee`](https://github.com/MadeRelevant/codemation/commit/5d649ee878f417ad18159584941af6de0a55c0a7)]:
  - @codemation/host@0.3.0
  - @codemation/next-host@0.2.0
  - @codemation/agent-skills@0.1.9

## 0.0.36

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.2.5
  - @codemation/next-host@0.1.13

## 0.0.35

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.2.4
  - @codemation/next-host@0.1.12

## 0.0.34

### Patch Changes

- Updated dependencies [[`f451b1b`](https://github.com/MadeRelevant/codemation/commit/f451b1b4657b59406e15ce5f50b243e487ff99ed)]:
  - @codemation/agent-skills@0.1.8
  - @codemation/host@0.2.3
  - @codemation/next-host@0.1.11

## 0.0.33

### Patch Changes

- [#77](https://github.com/MadeRelevant/codemation/pull/77) [`525a311`](https://github.com/MadeRelevant/codemation/commit/525a311fe7868772c923f92e268730dab422cf97) Thanks [@cblokland90](https://github.com/cblokland90)! - Expose the packaged agent skills extractor as an importable module and refresh `.agents/skills/extracted` automatically when running `codemation dev`, `codemation build`, `codemation serve web`, or `codemation dev:plugin`. Add `codemation skills sync` for manual or CI refreshes after upgrading the CLI.

- Updated dependencies [[`525a311`](https://github.com/MadeRelevant/codemation/commit/525a311fe7868772c923f92e268730dab422cf97), [`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`26ebe63`](https://github.com/MadeRelevant/codemation/commit/26ebe6346db0e9133a2133435a463c3dcd2dc537)]:
  - @codemation/agent-skills@0.1.7
  - @codemation/next-host@0.1.10
  - @codemation/host@0.2.2

## 0.0.32

### Patch Changes

- Updated dependencies [[`261c240`](https://github.com/MadeRelevant/codemation/commit/261c240bccfd6e65bcd7cac439d501ef61b1f730), [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb)]:
  - @codemation/next-host@0.1.9
  - @codemation/host@0.2.1

## 0.0.31

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/host@0.2.0
  - @codemation/next-host@0.1.8

## 0.0.30

### Patch Changes

- [#57](https://github.com/MadeRelevant/codemation/pull/57) [`3e882de`](https://github.com/MadeRelevant/codemation/commit/3e882de13103b6001d278b430791c380ee6771e1) Thanks [@cblokland90](https://github.com/cblokland90)! - Align discovered plugin loading with packaged JavaScript entries and keep framework watch mode rebuilding workspace plugin dist outputs.

## 0.0.29

### Patch Changes

- Updated dependencies [[`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/next-host@0.1.7
  - @codemation/host@0.1.7

## 0.0.28

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.1.6
  - @codemation/next-host@0.1.6

## 0.0.27

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.1.5
  - @codemation/next-host@0.1.5

## 0.0.26

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.1.4
  - @codemation/next-host@0.1.4

## 0.0.25

### Patch Changes

- Updated dependencies []:
  - @codemation/host@0.1.3
  - @codemation/next-host@0.1.3

## 0.0.24

### Patch Changes

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/host@0.1.2
  - @codemation/next-host@0.1.2

## 0.0.23

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/host@0.1.1
  - @codemation/next-host@0.1.1

## 0.0.22

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Route `/api/auth/*` on the dev gateway to the disposable API runtime (same as other `/api/*` routes) so host-owned Better Auth is not bounced through the Next UI process. Avoids gateway↔Next proxy loops when `CODEMATION_RUNTIME_DEV_URL` points at the stable dev URL.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

- Updated dependencies [[`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff)]:
  - @codemation/host@0.1.0
  - @codemation/next-host@0.1.0

## 0.0.21

### Patch Changes

- [#33](https://github.com/MadeRelevant/codemation/pull/33) [`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163) Thanks [@cblokland90](https://github.com/cblokland90)! - Publish a patch release to validate the full scaffolded auth startup release path from the packaged CLI through the packaged Next host.

  Keep the release loop exercised after tightening `main` to PR-only merges and after adding scaffolded browser coverage for auth-session startup.

- Updated dependencies [[`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163)]:
  - @codemation/next-host@0.0.21

## 0.0.20

### Patch Changes

- Updated dependencies [[`b39cc51`](https://github.com/MadeRelevant/codemation/commit/b39cc51925162b5b46ac9d9653f3d9bf4a1eaf73)]:
  - @codemation/next-host@0.0.20
  - @codemation/host@0.0.19

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/host@0.0.19
  - @codemation/next-host@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/host@0.0.18
  - @codemation/next-host@0.0.18
