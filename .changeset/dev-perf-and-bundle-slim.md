---
"@codemation/cli": minor
"@codemation/core": patch
"@codemation/host": patch
"@codemation/next-host": minor
---

Major dev-server startup-time and bundle-size improvements, plus dev-CLI hardening.

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
