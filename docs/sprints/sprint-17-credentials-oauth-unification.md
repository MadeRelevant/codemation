# Sprint 17 — Credentials + OAuth unification

> **Goal**: Ship v1 credentials where regular nodes and MCP servers share one credential model. The OSS framework knows zero about "broker"; managed mode is an injected `OAuthFlowExecutor` only. End-to-end validation: a Gmail trigger node and a Gmail MCP server in the same workflow bind to the same `oauth.google.gmail` credential instance.
>
> **Design source of truth**: [`docs/design/credentials-oauth-unification.md`](../design/credentials-oauth-unification.md). Read it before picking up a story.
>
> **Status**: 🟡 planned. Stories ready for delegation.
>
> **Sized for**: each story is one sonnet-medium agent run (~30–90 min). Stories have explicit acceptance criteria so the user can stop the agent early if it goes off-rails.

## Scope

**In**:

- Mode-agnostic credential plumbing (`OAuthFlowExecutor`, types, slots, instances)
- Framework OAuth presets (`oauth.google.gmail`, etc.) + `oauthApps` config block
- Gmail migration (the validation)
- Control-plane live catalog (replaces pairing-time push)
- `ManagedOAuthFlowExecutor`
- Cleanup of v0 broker fields and types
- Activation-time scope validation
- End-to-end Windows test against control-plane

**Out**:

- Slot-level scope refinement (post-v1)
- Workflow-linter UX (post-v1)
- Migrating non-Gmail products (separate sprint per product, follows this pattern)

## Risks

- **Cross-repo coordination**: Phase 4 touches the control-plane repo. The host work in 4.2–4.4 should be testable against a stub control-plane endpoint to avoid lockstep deploys.
- **Windows-first managed mode**: Phase 7 will be the first time the control-plane provisioning flow runs on Windows. If `pnpm dev` for control-plane fails on Windows for execa/spawn reasons we already know, those fixes apply equally.
- **Credential type identity**: framework defaults + consumer overrides + control-plane overrides all use the same `typeId` as the join key. Care needed in the merge logic (Phase 4.3) to make precedence deterministic.

## Story index

| #   | Title                                                                                | Phase | Depends on |
| --- | ------------------------------------------------------------------------------------ | ----- | ---------- |
| 1.1 | Define `OAuthFlowExecutor` interface                                                 | 1     | —          |
| 1.2 | Implement `LocalOAuthFlowExecutor`                                                   | 1     | 1.1        |
| 1.3 | DI wiring + executor selection at boot                                               | 1     | 1.2        |
| 2.1 | `oauthApps` block in `codemation.config.ts`                                          | 2     | 1.1        |
| 2.2 | Ship `oauth.google.gmail` framework preset                                           | 2     | 1.1        |
| 2.3 | Credential dialog drives `LocalOAuthFlowExecutor.start()`                            | 2     | 1.2, 2.2   |
| 3.1 | Migrate Gmail trigger node slot to `oauth.google.gmail`                              | 3     | 2.2        |
| 3.2 | MCP declaration shape change (`acceptedCredentialTypes`)                             | 3     | 2.2        |
| 3.3 | Browser verify: one credential, both nodes                                           | 3     | 3.1, 3.2   |
| 4.1 | Control-plane catalog endpoint contracts (in control-plane repo)                     | 4     | —          |
| 4.2 | Host-side `ControlPlaneCatalogFetcher` with caching                                  | 4     | 4.1        |
| 4.3 | Merge catalogs (framework + config + control plane), precedence rules                | 4     | 4.2        |
| 4.4 | `ManagedOAuthFlowExecutor` implementation                                            | 4     | 1.1, 4.2   |
| 5.1 | Remove `host.oauth2-via-broker` credential type                                      | 5     | 3.3        |
| 5.2 | Remove `RemoteOAuthRefreshDelegate` and related                                      | 5     | 5.1        |
| 5.3 | Remove `credentialKind`/`credentialTypeId`/`oauthAppKey` from `McpServerDeclaration` | 5     | 3.2        |
| 6.1 | Activation-time scope validation                                                     | 6     | 3.3        |
| 7.1 | Pair test-dev to local control-plane on Windows                                      | 7     | 4.\*       |
| 7.2 | Concierge provisions Gmail MCP workflow on managed side                              | 7     | 7.1        |
| 7.3 | End-to-end run: cron → agent → Gmail MCP in managed mode                             | 7     | 7.2        |

---

## Story 1.1 — Define `OAuthFlowExecutor` interface

**Goal**: A single interface that captures the OAuth dance + refresh, with no leakage of where the dance happens.

**Why**: Items 1–3 of the design's four-concept model must be expressible without knowing whether we're in framework or managed mode.

**Acceptance criteria**:

- New file `packages/core/src/credentials/OAuthFlowExecutor.types.ts` with:
  - `OAuthFlowStartArgs`: `{ typeId, scopes, redirectUri, instanceId? }`
  - `OAuthFlowStartResult`: `{ consentUrl, stateToken }`
  - `OAuthFlowCallbackArgs`: `{ stateToken, code }`
  - `OAuthMaterial`: `{ accessToken, refreshToken?, expiresAt?, grantedScopes }`
  - `OAuthFlowExecutor` interface with `start`, `completeCallback`, `refresh`
- Type-only file (no implementation). Exported from `@codemation/core`.
- No reference to "broker", "control plane", or "managed mode" anywhere in the file.
- `pnpm --filter @codemation/core typecheck` clean.

**Files to touch**: `packages/core/src/credentials/OAuthFlowExecutor.types.ts`, `packages/core/src/index.ts` (export), changeset.

**Out of scope**: implementations (1.2, 4.4).

---

## Story 1.2 — Implement `LocalOAuthFlowExecutor`

**Goal**: Concrete executor for framework mode. Runs the OAuth code-exchange directly against the provider using locally-held `clientId`/`clientSecret`.

**Acceptance criteria**:

- Class in `packages/host/src/credentials/LocalOAuthFlowExecutor.ts`, `@injectable()`, implements `OAuthFlowExecutor`.
- Reads OAuth app config from injected `OAuthAppRegistry` (defined in 2.1) keyed by `typeId`.
- `start` returns a Google/etc-style authorize URL with PKCE state token.
- `completeCallback` exchanges code → tokens, returns `OAuthMaterial`.
- `refresh` uses stored `refreshToken` + local app secret.
- Unit tests with mocked HTTP for Google's token endpoint shape (one test per method).
- `pnpm --filter @codemation/host test:unit` clean.

**Files to touch**: `packages/host/src/credentials/LocalOAuthFlowExecutor.ts`, sibling test file, changeset.

**Out of scope**: DI registration (1.3), config schema (2.1).

---

## Story 1.3 — DI wiring + executor selection at boot

**Goal**: At boot, register either `LocalOAuthFlowExecutor` (default) or `ManagedOAuthFlowExecutor` (when paired) behind a single `ApplicationTokens.OAuthFlowExecutor` token.

**Acceptance criteria**:

- New DI token `ApplicationTokens.OAuthFlowExecutor`.
- `AppContainerFactory` registers `LocalOAuthFlowExecutor` by default.
- A `// TODO(sprint-17 4.4)` comment marks where `ManagedOAuthFlowExecutor` will plug in when pairing is configured. Phase 4 wires that branch — for this story, only the local registration must exist.
- Nothing else in the codebase imports `LocalOAuthFlowExecutor` directly. Consumers inject via the token.

**Files to touch**: `packages/host/src/applicationTokens.ts`, `packages/host/src/bootstrap/AppContainerFactory.ts`.

---

## Story 2.1 — `oauthApps` block in `codemation.config.ts`

**Goal**: Workflow authors can declare OAuth app credentials (clientId/clientSecret per type) once in `codemation.config.ts`. Per-instance overrides win at the credential-instance level.

**Acceptance criteria**:

- `CodemationConfig.app` gains an optional `oauthApps: ReadonlyArray<{ type: string; clientId: string; clientSecret: string }>`.
- New class `OAuthAppRegistry` in `packages/host/src/credentials/`: `lookup(typeId): { clientId, clientSecret } | undefined`. Reads from `AppConfig.oauthApps`.
- Registered in DI, injected by `LocalOAuthFlowExecutor` (Story 1.2 consumes this).
- Documented in `apps/test-dev/codemation.config.ts` with a commented-out Gmail example.
- Unit test: registry returns config values; returns undefined for unknown types.

**Files to touch**: `packages/host/src/presentation/config/CodemationConfig.ts`, `presentation/config/AppConfig.ts`, `presentation/config/CodemationConfigNormalizer.ts`, `credentials/OAuthAppRegistry.ts`, sibling test, `apps/test-dev/codemation.config.ts` (example).

---

## Story 2.2 — Ship `oauth.google.gmail` framework preset

**Goal**: A `CredentialType` for Gmail OAuth with every Gmail scope as default, registered automatically by the framework.

**Acceptance criteria**:

- New `packages/core-nodes-gmail/src/credentials/oauthGoogleGmailType.ts` exports `oauthGoogleGmailType: CredentialType<...>` with:
  - `typeId: "oauth.google.gmail"`
  - `displayName: "Gmail (OAuth)"`
  - `auth: { kind: "oauth2", authorizeUrl, tokenUrl, defaultScopes: [...all Gmail scopes...] }`
  - `secretFields` schema for stored material (accessToken, refreshToken, expiresAt, grantedScopes)
- Registered automatically by the Gmail plugin's `codemation.plugin.ts`.
- `pnpm dev` in `apps/test-dev` shows `oauth.google.gmail` as a credential type option in the dialog.
- Unit test verifies the type's `defaultScopes` includes the union of all Gmail product scopes.

**Files to touch**: `packages/core-nodes-gmail/src/credentials/oauthGoogleGmailType.ts`, `packages/core-nodes-gmail/codemation.plugin.ts`, sibling test, changeset.

**Out of scope**: removing the old `GmailCredentialTypes.oauth` — happens in Story 3.1.

---

## Story 2.3 — Credential dialog drives `LocalOAuthFlowExecutor.start()`

**Goal**: When the user picks an OAuth-kind credential type and clicks "Connect" in the credential dialog, the framework runs the local OAuth dance and persists the resulting instance.

**Acceptance criteria**:

- "Connect" button in `CredentialDialog.tsx` (already exists for OAuth types) wires to a new `/api/credentials/oauth/start` endpoint.
- Endpoint resolves `OAuthFlowExecutor` from DI, calls `.start(...)`, returns the `consentUrl`.
- Callback endpoint `/api/credentials/oauth/callback` calls `.completeCallback(...)` and writes a `CredentialInstance` to the store.
- Manual browser verify: in test-dev with `oauthApps` config set + valid env vars, clicking Connect → Google consent → callback → instance shows in `/credentials`.
- Screenshot in `tmp/sprint17-2.3-connect.png`.

**Files to touch**: `packages/host/src/presentation/http/routeHandlers/OAuth2HttpRouteHandlerFactory.ts` (likely already exists, extend), `packages/next-host/src/features/credentials/components/CredentialDialog.tsx`, changeset.

---

## Story 3.1 — Migrate Gmail trigger node slot to `oauth.google.gmail`

**Goal**: All Gmail-based nodes declare their credential slot with `acceptedTypes: ["oauth.google.gmail"]`, not the legacy `GmailCredentialTypes.oauth`.

**Acceptance criteria**:

- Every Gmail node file's `getCredentialRequirements()` uses `["oauth.google.gmail"]`.
- `GmailCredentialTypes.oauth` constant + the legacy type definition removed (or kept as a deprecated alias if any other plugin uses it — verify with grep).
- `pnpm --filter @codemation/core-nodes-gmail test:unit` clean.

**Files to touch**: ~5 Gmail node files (ModifyGmailLabels, etc.), the type-export file, plugin registrar.

---

## Story 3.2 — MCP declaration shape change

**Goal**: `McpServerDeclaration` exposes credential needs via `acceptedCredentialTypes` (matching `CredentialRequirement.acceptedTypes`), not `credentialKind`/`credentialTypeId`/`oauthAppKey`.

**Acceptance criteria**:

- `McpServerDeclaration` shape in `packages/core/src/contracts/mcpTypes.ts`:
  - Replace `credentialKind` + `credentialTypeId` + `oauthAppKey` with `acceptedCredentialTypes?: ReadonlyArray<string>`.
  - Absent or empty array = no credential required.
- `AgentConnectionNodeCollector.buildMcpCredentialSource` becomes a trivial map from `acceptedCredentialTypes` → `CredentialRequirement.acceptedTypes`.
- `McpServerCatalog.validate` updated.
- Gmail MCP declaration in `packages/core-nodes-gmail/codemation.plugin.ts` uses `acceptedCredentialTypes: ["oauth.google.gmail"]`.
- All MCP-related tests in `packages/host/test/mcp/*` + `packages/core/test/ai/*` + `packages/host/test/credentials/workflowCredentialNodeResolverMcp.test.ts` pass.

**Files to touch**: 1 contract, 1 collector, 1 catalog, 1 declaration, ~5 test files. Changeset.

---

## Story 3.3 — Browser verify: one credential, both nodes

**Goal**: Prove the unification works end-to-end in framework mode. The same `oauth.google.gmail` credential instance binds to both a Gmail trigger node and a Gmail MCP server in the same workflow.

**Acceptance criteria**:

- Add a test workflow `apps/test-dev/src/workflows/gmail-unified/gmail-unified-cred.ts`: cron → GmailTrigger → AIAgent (with Gmail MCP attached).
- In browser: create ONE `oauth.google.gmail` instance via Connect flow.
- Bind it to the GmailTrigger node's credential slot.
- Bind THE SAME instance to the Gmail MCP slot.
- Verify both dropdowns offered the instance.
- Activate the workflow → no scope errors (broad scopes cover both uses).
- Screenshots: `tmp/sprint17-3.3-both-bound.png`.

**Files to touch**: test workflow file, optional UI tweaks if the dropdown needs a hint about reuse.

**Out of scope**: actually running the workflow (no real Gmail account in the test — bind + activation success is enough).

---

## Story 4.1 — Control-plane catalog endpoint contracts (control-plane repo)

**Goal**: Define + implement the HTTP contracts the host will fetch from. Lives in `../control-plane`, not this repo.

**Acceptance criteria**:

- Three GET endpoints (HMAC-authenticated like other pairing endpoints):
  - `GET /api/catalog/oauth-apps` → `{ apps: [{ typeId, displayName, ... }] }`
  - `GET /api/catalog/mcp-servers` → `{ servers: McpServerDeclaration[] }` (using the v1 shape from 3.2)
  - `GET /api/catalog/credential-types` → `{ types: CredentialTypeDefinition[] }`
- Each endpoint supports `If-None-Match` / `ETag` for cache validation.
- OpenAPI spec or TS contract file checked in to control-plane repo.
- Mock/fixture endpoint usable by the host's `ControlPlaneCatalogFetcher` (Story 4.2) without a live control plane.

**Files to touch**: control-plane repo only.

---

## Story 4.2 — Host-side `ControlPlaneCatalogFetcher` with caching

**Goal**: A host-side fetcher that pulls the three catalogs from control plane and caches them, with ETag-based invalidation.

**Acceptance criteria**:

- Class `ControlPlaneCatalogFetcher` in `packages/host/src/mcp/` (sibling of `McpRegistryFetcher`).
- Polls or fetches-on-demand (TBD per agent — defaults to on-demand with 5-min stale-while-revalidate).
- Caches the three catalogs in memory; uses `ETag` to skip re-parsing unchanged payloads.
- Gated on `appConfig.pairing` being configured. No-op when standalone.
- Unit test with mocked fetch.

**Files to touch**: `packages/host/src/mcp/ControlPlaneCatalogFetcher.ts`, sibling test.

---

## Story 4.3 — Merge catalogs (framework + config + control plane)

**Goal**: A single registry that overlays the three layers (framework defaults → consumer config → control plane) with control plane winning on overlapping `typeId`s.

**Acceptance criteria**:

- `CredentialTypeRegistry`, `McpServerCatalog`, and a new `OAuthAppRegistry` all read from layered sources.
- Precedence: control plane > consumer config > framework default. Full replacement on overlap, NOT field merge.
- Cache invalidation: when `ControlPlaneCatalogFetcher` reports a change, registries refresh.
- Unit tests cover: empty control plane, control plane overrides framework, control plane adds new types.

**Files to touch**: existing registries — `McpServerCatalog.ts`, `CredentialTypeRegistry` (find exact location), new `OAuthAppRegistry`. Tests.

---

## Story 4.4 — `ManagedOAuthFlowExecutor` implementation

**Goal**: Concrete executor for managed mode. Delegates the OAuth dance to control plane; receives pushed material back via `/internal/credentials/push`.

**Acceptance criteria**:

- Class `ManagedOAuthFlowExecutor` implements `OAuthFlowExecutor`.
- `start` POSTs to control plane `/api/oauth/start` (control-plane endpoint to be defined alongside) and returns the consent URL.
- `completeCallback` is a no-op (control plane handles callback + pushes material back via the existing `/internal/credentials/push` route).
- `refresh` POSTs to control plane `/api/oauth/refresh`.
- `AppContainerFactory` DI wiring (from Story 1.3) switches to this when `appConfig.pairing` is configured.
- Existing `InternalCredentialsPushRegistrar` verified to handle the new shape (likely already does, since the material schema doesn't change).

**Files to touch**: `packages/host/src/credentials/ManagedOAuthFlowExecutor.ts`, `AppContainerFactory.ts` (replace the TODO from 1.3), test.

---

## Story 5.1 — Remove `host.oauth2-via-broker` credential type

**Goal**: Delete the conflated v0 type now that nothing depends on it.

**Acceptance criteria**:

- `packages/host/src/credentials/OAuth2ViaBrokerCredentialTypeFactory.ts` deleted.
- All references removed (grep clean).
- `pnpm typecheck` repo-wide clean.

**Files to touch**: source file + grep refs.

---

## Story 5.2 — Remove `RemoteOAuthRefreshDelegate` and related

**Goal**: All refresh paths now go through `OAuthFlowExecutor.refresh`. Remove the special delegate.

**Acceptance criteria**:

- `RemoteOAuthRefreshDelegate` and related delete.
- Any direct references replaced by `container.resolve(ApplicationTokens.OAuthFlowExecutor).refresh(...)`.
- Repo-wide typecheck clean.

**Files to touch**: ~3 host files.

---

## Story 5.3 — Remove deprecated MCP declaration fields

**Goal**: Drop `credentialKind`, `credentialTypeId`, `oauthAppKey` from `McpServerDeclaration` after the migration in 3.2 has settled.

**Acceptance criteria**:

- Fields deleted from `packages/core/src/contracts/mcpTypes.ts`.
- Any back-compat shim in `McpServerCatalog.validate` deleted.
- Repo-wide typecheck clean.

**Files to touch**: 1 contract, 1 catalog.

---

## Story 6.1 — Activation-time scope validation

**Goal**: At workflow activation, check that every bound credential instance has `grantedScopes ⊇ (union of scopes required by all slots that bind it)`. Fail the activation with an actionable message if not.

**Acceptance criteria**:

- `WorkflowActivationPolicy` (or equivalent gate) checks scope sufficiency per binding.
- Failure surfaces in the existing activation-error toast/dialog as: `Credential "<name>" missing scopes: <list>. Reconnect to grant.`
- Unit + integration tests for both pass and fail cases.

**Files to touch**: activation policy + tests.

---

## Story 7.1 — Pair test-dev to local control-plane on Windows

**Goal**: Run framework (`pnpm dev` in `apps/test-dev`) paired with a locally-running control-plane on Windows. First time this combination is exercised on Windows — surface and fix any spawn/portability issues.

**Acceptance criteria**:

- Both processes boot cleanly on Windows.
- `WORKSPACE_PAIRING_SECRET` flow completes.
- Host successfully fetches `/api/catalog/*` from control plane (verified by log + curl).

**Files to touch**: likely portability fixes in control-plane repo (similar to what we did for framework: spawn/PATH/cmd-shim issues).

**Note**: this story may spawn sub-stories for any concrete Windows bugs discovered. Capture them as 7.1.a, 7.1.b etc.

---

## Story 7.2 — Concierge provisions Gmail MCP workflow on managed side

**Goal**: Use the control-plane concierge agent to create a workspace, register the Gmail MCP server (defined on control plane, not in framework), and instruct the concierge to author a workflow using it.

**Acceptance criteria**:

- Workspace + user provisioned via control-plane.
- Gmail MCP server appears in the workspace's available-servers list (proves the live-catalog path works).
- Concierge generates a workflow file containing an AIAgent + Gmail MCP attachment.

**Files to touch**: control-plane repo only (provisioning flow). Host should require zero changes if 1–6 landed correctly.

---

## Story 7.3 — End-to-end run: cron → agent → Gmail MCP in managed mode

**Goal**: The workflow produced in 7.2 runs successfully on the host, using a credential created via the `ManagedOAuthFlowExecutor` flow (consent at control plane, tokens pushed back).

**Acceptance criteria**:

- Connect Gmail credential via managed flow (browser → control plane → Google consent → tokens land in host store).
- Activate workflow.
- Cron tick fires; agent reads mailbox via Gmail MCP; output written.
- Screenshot of green run in `tmp/sprint17-7.3-managed-run.png`.

**Files to touch**: none expected; this is the integration validation.

---

## Done means

- Phase 3.3 passes: one credential, two slots, both green in framework mode.
- Phase 7.3 passes: same workflow runs in managed mode with control-plane-issued credential.
- Repo-wide grep for "broker" turns up nothing in `packages/core` or any plugin package. (`@codemation/host` can still mention it internally as the transport name for `ManagedOAuthFlowExecutor`, but it must not leak into contracts.)
