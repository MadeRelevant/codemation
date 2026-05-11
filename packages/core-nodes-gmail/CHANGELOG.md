# @codemation/core-nodes-gmail

## 0.3.0

### Minor Changes

- [#137](https://github.com/MadeRelevant/codemation/pull/137) [`7b50018`](https://github.com/MadeRelevant/codemation/commit/7b50018d5e452f4bfe2375ec1a7895915ce46f0a) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(core-nodes,msgraph,gmail): inspectorSummary on every built-in node

  Implements `inspectorSummary()` on all built-in node and trigger config classes so the workflow
  inspector panel introduced in [#136](https://github.com/MadeRelevant/codemation/issues/136) has content for every shipped node.
  - `@codemation/core`: extends `definePollingTrigger` to accept and plumb an `inspectorSummary`
    option, mirroring the existing `defineNode` / `defineBatchNode` pattern. Also extends
    `defineRestNode` (in `@codemation/core-nodes`) with the same option.
  - `@codemation/core-nodes`: `inspectorSummary()` on `HttpRequest`, `AIAgent`, `CronTrigger`,
    `ManualTrigger`, `SubWorkflow`, `Callback`, `If`, `Switch`, `Filter`, `Split`, `Merge`,
    `Wait`, `WebhookTrigger`, `TestTrigger`, `Aggregate`, `MapData`, `Assertion`.
  - `@codemation/core-nodes-msgraph`: `inspectorSummary` option on all 17 mail/drive/excel nodes
    plus the `onNewMsGraphMailTrigger` polling trigger.
  - `@codemation/core-nodes-gmail`: `inspectorSummary()` on `OnNewGmailTrigger`.
    Gmail action nodes (`SendGmailMessage`, `ReplyToGmailMessage`, `ModifyGmailLabels`) return
    `undefined` — all their config is per-item via `inputSchema`, nothing to surface at design time.
  - `@codemation/core`: `WorkflowSnapshotCodec.serializeConfig` now pre-serializes the result of
    `inspectorSummary()` into the snapshot JSON as `_inspectorSummary` so the browser-side mapper
    can surface the same rows without calling class methods.
  - `@codemation/next-host`: `PersistedWorkflowSnapshotMapper` now reads `_inspectorSummary` from
    the serialized config and includes it in the node DTO, maintaining parity with the live mapper.

### Patch Changes

- Updated dependencies [[`e4d3e1a`](https://github.com/MadeRelevant/codemation/commit/e4d3e1a1526e27bc226af186deb671cee53682c8), [`7b50018`](https://github.com/MadeRelevant/codemation/commit/7b50018d5e452f4bfe2375ec1a7895915ce46f0a), [`e4d3e1a`](https://github.com/MadeRelevant/codemation/commit/e4d3e1a1526e27bc226af186deb671cee53682c8), [`0082ab5`](https://github.com/MadeRelevant/codemation/commit/0082ab5fe99893dd4a483c714393a4a9f44eb39e)]:
  - @codemation/core@0.11.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384)]:
  - @codemation/core@0.10.2

## 0.2.3

### Patch Changes

- [#126](https://github.com/MadeRelevant/codemation/pull/126) [`d0f2bd9`](https://github.com/MadeRelevant/codemation/commit/d0f2bd9a670ff80c2e2e12f7c410c63d14c94b55) Thanks [@cblokland90](https://github.com/cblokland90)! - Stream Gmail attachment downloads via `responseType: "stream"` + streaming JSON parser (`stream-json`) + chunked base64url decoder instead of materialising the full base64 string and decoded buffer in memory. `GmailMessageAttachmentContent.body` is now `AsyncIterable<Uint8Array>` (compatible with the `BinaryBody` union accepted by `ctx.binary.attach`).

- Updated dependencies [[`1f10121`](https://github.com/MadeRelevant/codemation/commit/1f10121a093ef0612a33c873419b032709c9964d)]:
  - @codemation/core@0.10.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`847deb4`](https://github.com/MadeRelevant/codemation/commit/847deb4c42801632bfb970cdb2625cd0755241cb)]:
  - @codemation/core@0.10.0

## 0.2.1

### Patch Changes

- [#110](https://github.com/MadeRelevant/codemation/pull/110) [`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c) Thanks [@cblokland90](https://github.com/cblokland90)! - Add per-package `test:unit` scripts so Turbo can address each package individually for affected-only filtering. No runtime changes — dev-tooling only.

- [#108](https://github.com/MadeRelevant/codemation/pull/108) [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf) Thanks [@cblokland90](https://github.com/cblokland90)! - Migrate gmail dev workflows from `apps/test-dev` into `packages/core-nodes-gmail/dev/`. The plugin's sandbox now discovers `./dev/workflows`, so `cd packages/core-nodes-gmail && pnpm dev` boots the gmail demos directly. `apps/test-dev` no longer depends on `@codemation/core-nodes-gmail`.

- [#108](https://github.com/MadeRelevant/codemation/pull/108) [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf) Thanks [@cblokland90](https://github.com/cblokland90)! - Plugin-author `pnpm dev` mode. Each plugin package now ships a `dev` script that builds the framework once via `turbo run build --filter='@codemation/next-host'` (Turbo caches subsequent runs) and then starts `codemation dev:plugin --plugin-root .` against the plugin's `codemation.plugin.ts`. No watchers on the framework. The previous `tsdown --watch` script is preserved as `dev:watch-bundle` for the rare case a downstream consumer needs the plugin's `dist/` rebuilt on save.

  Documented in `docs/development-modes.md` as "Plugin author mode". Recommended path for single-plugin work; `apps/plugin-dev` remains for cross-plugin scenarios.

- [#108](https://github.com/MadeRelevant/codemation/pull/108) [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf) Thanks [@cblokland90](https://github.com/cblokland90)! - Extract generic polling-trigger machinery from gmail into core and expose it via setup context.

  **`@codemation/core`** — new polling-trigger API
  - New `PollingTriggerRuntime` class: owns the set-interval loop, overlap guard, and state persistence via `TriggerSetupStateRepository`. Plugin authors no longer need to implement these themselves.
  - New `PollingTriggerDedupWindow` class: merges processed-ID sets with a configurable cap (default 2000). Prevents unbounded memory growth across polling cycles.
  - New `PollingTriggerHandle` interface exposed on `TriggerSetupContext.polling`: pre-binds trigger id, emit, and registerCleanup so plugin code only supplies `intervalMs` and `runCycle`. The handle also carries a `.dedup` reference for message-level deduplication.
  - `EngineDeps.pollingTriggerLogger` optional field: hosts may wire a real logger; defaults to a no-op.
  - `PollingTriggerRuntime`, `PollingTriggerDedupWindow`, and `NoOpPollingTriggerLogger` are exported from the main `@codemation/core` barrel.
  - ESLint `allowedConstructorNames` extended to include `AbortController` (a global built-in, not a DI-managed class).

  **`@codemation/core-nodes-gmail`** — internal refactor, no external API change
  - `GmailPollingTriggerRuntime` deleted; loop/overlap-guard/persistence now come from the core runtime.
  - `GmailPollingService.poll` renamed to `runCycle`; repo injection and `persist()` method removed; dedup delegated to `PollingTriggerDedupWindow`.
  - `OnNewGmailTriggerNode.setup` now calls `ctx.polling.start(...)` instead of `gmailPollingTriggerRuntime.ensureStarted(...)`.
  - `GmailNodeTokens.RuntimeLogger` token removed (no longer needed).

- Updated dependencies [[`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c), [`6566d55`](https://github.com/MadeRelevant/codemation/commit/6566d55c829f6631357ac95052b0852e86092ac5), [`a77505f`](https://github.com/MadeRelevant/codemation/commit/a77505f331d7d3892f3c1c8f19dc37952b4d96bd), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`6fc7d3f`](https://github.com/MadeRelevant/codemation/commit/6fc7d3fe95f8d88386c16971fffa8dd3faa7704f), [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb)]:
  - @codemation/core@2.0.0

## 0.2.0

### Minor Changes

- [#98](https://github.com/MadeRelevant/codemation/pull/98) [`a141c22`](https://github.com/MadeRelevant/codemation/commit/a141c22ed4451092def9d4ea1c57706264ce6b7d) Thanks [@cblokland90](https://github.com/cblokland90)! - Make Gmail action nodes composable by moving per-call fields from constructor config into Zod-validated workflow item inputs.

  `SendGmailMessage`, `ReplyToGmailMessage`, and `ModifyGmailLabels` now use `inputSchema` and read `args.input`, so constructors are `new SendGmailMessage(name, id?)`, `new ReplyToGmailMessage(name, id?)`, and `new ModifyGmailLabels(name, id?)`. Build the wire payload in an upstream step instead of using the old `{ fn: ... }` config wrappers:

  ```ts
  .map("Build Gmail reply", (item, ctx) => ({
    messageId: ctx.data.getOutputItem("mail", 0)!.json.messageId,
    html: item.json.htmlBody,
    replyToSenderOnly: true,
    headers: item.json.bcc ? { Bcc: item.json.bcc } : undefined,
  }))
  .then(new ReplyToGmailMessage("Reply to sender"))
  ```

  Outgoing attachments are now binary references only: pass `attachments: [{ binaryName: "quote", filename: "quote.pdf", mimeType: "application/pdf" }]` and ensure the current item has `item.binary.quote` (for example from `OnNewGmailTrigger` with `downloadAttachments: true`, or from a custom node using `ctx.binary.attach`). Inline `body: Uint8Array | string` attachments are no longer accepted, because storing file bytes or base64 in `item.json` bloats persisted run JSON in the database while binary attachments persist only storage references on the item.

## 0.1.7

### Patch Changes

- Updated dependencies [[`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce)]:
  - @codemation/core@1.0.1

## 0.1.6

### Patch Changes

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/core@1.0.0

## 0.1.5

### Patch Changes

- [`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3) Thanks [@cblokland90](https://github.com/cblokland90)! - Default DI container registrations to singletons so framework services that own long-lived resources (timers, subscriptions, sockets) have deterministic lifecycles. Previously `container.register(Class, { useClass: Class })` produced a new instance per resolution, which caused the `WorkflowRunRetentionPruneScheduler` `setInterval` timer to leak across HMR reloads and blocked `pnpm dev` from shutting down on Ctrl+C.

  Public registration DTOs still accept `useClass` as a shape hint, but the host applies every class-based registration as a singleton. Plugin authors using `plugin.register({ registerNode, registerClass })` and consumers using `containerRegistrations: [{ token, useClass }]` no longer need to reason about lifecycle. Redundant `@registry([{ useClass }])` decorators on Hono route registrars and domain event handlers have been removed.

  A new ESLint rule (`codemation/no-transient-container-register`) prevents reintroducing `.register(token, { useClass: Class })` and `@registry([{ useClass: Class }])` patterns across `packages/**` and `apps/**`.

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/core@0.8.1

## 0.1.4

### Patch Changes

- [#88](https://github.com/MadeRelevant/codemation/pull/88) [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry-backed node inspector slice for workflow detail and expose run-trace telemetry needed to power it.

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f)]:
  - @codemation/core@0.8.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4)]:
  - @codemation/core@0.7.0

## 0.1.2

### Patch Changes

- [#73](https://github.com/MadeRelevant/codemation/pull/73) [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve credential UX and add extensible advanced field presentation.
  - Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
  - Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
  - Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
  - Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
  - Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.

- Updated dependencies [[`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb), [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1)]:
  - @codemation/core@0.6.0

## 0.1.1

### Patch Changes

- [#64](https://github.com/MadeRelevant/codemation/pull/64) [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

  Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.

## 0.1.0

### Minor Changes

- [#60](https://github.com/MadeRelevant/codemation/pull/60) [`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c) Thanks [@cblokland90](https://github.com/cblokland90)! - Harden the Gmail plugin so it imports reliably from the package root, returns an authenticated official Gmail session, and supports trigger/read/send/reply/label workflows with one OAuth credential.

  Add framework support for OAuth scope presets and custom per-credential scope replacement, and update the plugin starter/docs so future plugins scaffold the same publishable root-entrypoint conventions.

### Patch Changes

- [#61](https://github.com/MadeRelevant/codemation/pull/61) [`e92d110`](https://github.com/MadeRelevant/codemation/commit/e92d1102293cf4b2874dcbae2e7e86886675984b) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix the package root entrypoint smoke tests so they build `@codemation/core` and this package from a clean checkout before verifying published `dist` files and consumer imports (the Gmail bundle loads core at runtime).

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0

## Unreleased

### Minor Changes

- Fix the published root entrypoints so `@codemation/core-nodes-gmail` resolves to real `dist/index.*` artifacts under Node ESM and consumer-style builds.
- Make the package root the canonical public API for trigger types, Gmail session types, attachment helpers, and Google Gmail helper classes.
- Remove Gmail service-account credential support and standardize on OAuth.
- Expand the default Gmail OAuth scope bundle to cover trigger/read/send/reply/label workflows, with `scopePreset` plus full custom replacement via `customScopes`.
- Return an authenticated official Gmail client session from the Gmail credential and add high-level helpers for send, reply, MIME composition, and label updates.

## 0.0.28

### Patch Changes

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0

## 0.0.27

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0

## 0.0.26

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3

## 0.0.25

### Patch Changes

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2

## 0.0.24

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1

## 0.0.23

### Patch Changes

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/core@0.2.0

## 0.0.22

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/core@0.1.0

## 0.0.21

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

## 0.0.20

### Patch Changes

- [#28](https://github.com/MadeRelevant/codemation/pull/28) [`b39cc51`](https://github.com/MadeRelevant/codemation/commit/b39cc51925162b5b46ac9d9653f3d9bf4a1eaf73) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix Gmail trigger preview/manual-run regressions and restore fresh scaffold auth startup in the packaged Next host.

  Clarify the trigger item contract so integrations emit one workflow item per external event instead of wrapper payloads.

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
