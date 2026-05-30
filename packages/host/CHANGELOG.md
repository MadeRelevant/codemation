# @codemation/host

## 0.9.0

### Minor Changes

- [#170](https://github.com/MadeRelevant/codemation/pull/170) [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(credentials): app gallery API (framework half)

  Adds the framework-side credential "app gallery" surface that the control
  plane's credentials gallery UI consumes:
  - `@codemation/host`: a `GET /api/credentials/apps` endpoint backed by a new
    `GetCredentialAppsQuery` / handler and an `AppGalleryProjector` that projects
    the configured credential types + connected instances into `AppGalleryEntry`
    rows (`AppsResponse`). Wired through `CredentialContractsRegistry`,
    `ApiPaths.credentialApps()`, the credential route registrar/handler, and DI.
  - `@codemation/canvas-core`: `WorkflowCanvasApiClient.fetchCredentialApps()`,
    the `credentialAppsQueryKey`, and a `useCredentialAppsQuery` hook.
  - `@codemation/next-host`: `NextHostApiClientAdapter.fetchCredentialApps()` so
    the dev shell satisfies the canvas API client contract.

- [#167](https://github.com/MadeRelevant/codemation/pull/167) [`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6) Thanks [@cblokland90](https://github.com/cblokland90)! - feat(hitl): Human-in-the-Loop — engine suspend/resume, inbox approval node + channels (local + control-plane), agent-as-tool, decision/timeout handling, inbox decision UX (toast + node status icons + "waiting for approval"), plus the consolidated dev/canvas/host fixes shipped alongside.

### Patch Changes

- [#170](https://github.com/MadeRelevant/codemation/pull/170) [`0b3d2a3`](https://github.com/MadeRelevant/codemation/commit/0b3d2a3dc379c0d8a6509ae97e47f6bb880caea3) Thanks [@cblokland90](https://github.com/cblokland90)! - fix(host): allow CP_WEB_ORIGIN to be a comma-separated CORS allowlist

  `ManagedCorsMiddleware` compared the request origin with `===` against the raw
  `CP_WEB_ORIGIN` value, so when the provisioner injects more than one origin
  (e.g. the Caddy origin plus the direct dev port) the joined string never
  matched any real origin. Every CORS preflight 403'd, which left the control
  plane's workspace canvas stuck on "Getting your canvas ready…". The middleware
  now parses `CP_WEB_ORIGIN` as a comma-separated allowlist and echoes back the
  request's own origin when it is a member.

- Updated dependencies [[`3044474`](https://github.com/MadeRelevant/codemation/commit/3044474495525490735510ff74500b53761284b6)]:
  - @codemation/core@0.12.0
  - @codemation/core-nodes@0.9.0
  - @codemation/eventbus-redis@0.0.40

## 0.8.0

### Minor Changes

- [#150](https://github.com/MadeRelevant/codemation/pull/150) [`8ac207a`](https://github.com/MadeRelevant/codemation/commit/8ac207ab263542e46fad0b9e1ea584fbb71a747c) Thanks [@cblokland90](https://github.com/cblokland90)! - Add workspace-host Docker image packaging and managed template peerDeps fix.
  - Move @codemation/\* from dependencies to peerDependencies in the managed template (avoids n8n-style dual-instance singleton trap at runtime; framework packages resolve from the base image)
  - Add codemationVersion: "1.0.0" field to managed template codemation.config.ts and DefineCodemationAppOptions (reserved compatibility-date slot, no enforcement yet)
  - Add packages/host/src/bin/server.ts standalone entry point for workspace pod runtime
  - Add packaging/workspace-host/Dockerfile for the codemation-workspace-host:1.0.0 base image

### Patch Changes

- [#153](https://github.com/MadeRelevant/codemation/pull/153) [`a70e182`](https://github.com/MadeRelevant/codemation/commit/a70e182a852026e4f6d8f317fe9862417dc23ce6) Thanks [@cblokland90](https://github.com/cblokland90)! - Move UI-only packages (monaco-editor, react, @xyflow/react, dagre, lucide-react, rc-tree, etc.) from `dependencies` to `devDependencies` in @codemation/host. No runtime source in `packages/host/src` imports these packages — they were vestigial from before the UI was extracted to @codemation/next-host. Moving them ensures pnpm filtered installs (e.g. `--filter @codemation/host...`) no longer pull in ~1.5 GB of UI dependencies, which is required for the workspace-host container image to stay small.

- [#156](https://github.com/MadeRelevant/codemation/pull/156) [`5315e23`](https://github.com/MadeRelevant/codemation/commit/5315e2361492560601ac2c97491aa58c49346fd4) Thanks [@cblokland90](https://github.com/cblokland90)! - fix(host): only throw on invalid WORKSPACE_PAIRING_SECRET in managed mode

  Previously, setting WORKSPACE_PAIRING_SECRET to an invalid value (not a 32-byte base64 string) would crash the host at boot time even when running in non-managed mode (the default). Framework consumers who accidentally set this env var or left a misconfigured value would see an opaque boot error unrelated to their actual configuration.

  After this fix, the invalid-secret error is only propagated in `auth.kind: "managed"` mode. In all other modes, the error is caught, a warning is logged, and the host boots normally without pairing infrastructure wired up. Managed-mode consumers continue to see the full error at startup.

- [#152](https://github.com/MadeRelevant/codemation/pull/152) [`ac860a5`](https://github.com/MadeRelevant/codemation/commit/ac860a5af1df3e5766581e644fef8cc0d1b24eba) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix ControlPlaneCatalogFetcher calling wrong URL path (sprint-mvp/01).

  The fetcher was calling `/api/catalog/*` (session-gated in the CP) instead of
  `/internal/catalog/*` (HMAC-gated). The CP's `/api/*` router returned 401 for
  every HMAC-signed request because it requires a Better Auth session cookie, not a
  workspace pairing signature.

  This caused every provisioned workspace to log steady `HTTP 401 Unauthorized`
  errors from `ControlPlaneCatalogFetcher`, blocking OAuth credential-type and MCP
  server catalog fetches.

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

- Updated dependencies [[`e0933eb`](https://github.com/MadeRelevant/codemation/commit/e0933ebc51806a9593f94758860c591b8346a7a5), [`3025b86`](https://github.com/MadeRelevant/codemation/commit/3025b8685b0d7ad60c506b5a0f21967e681a25ea)]:
  - @codemation/core@0.11.1
  - @codemation/core-nodes@0.8.1
  - @codemation/eventbus-redis@0.0.39

## 0.7.0

### Minor Changes

- 8285ec0: Add framework-side OAuth broker delegation (Story 4): HMAC-verified `POST /internal/credentials/push` and `GET /internal/credentials` endpoints on the installation's internal HTTP API; `BrokerClient` for calling the control-plane refresh endpoint via `PairedFetch`; `RemoteOAuthRefreshDelegate` with single-flight deduplication for refreshing expired access tokens through the broker.
- 8285ec0: Add `ControlPlaneCatalogFetcher` — polls the three control-plane catalog endpoints (`/api/catalog/oauth-apps`, `/api/catalog/mcp-servers`, `/api/catalog/credential-types`) on a configurable interval, caches last-known-good responses per endpoint independently, and exposes `oauthApps`, `mcpServers`, and `credentialTypeOverrides` getters. No-ops when pairing config is absent.
- 8285ec0: Add credential dialog Create-then-Connect flow for OAuth2 credential types.

  New endpoints `POST /api/credentials/oauth/start` and `GET /api/credentials/oauth/callback` drive the `OAuthFlowExecutor` directly from the credential dialog. The frontend starts the consent flow via a popup opened against the consent URL returned by `/start`; the `/callback` page exchanges the code, persists the tokens, and posts a message to close the popup.

  The `OAuthFlowExecutor` interface gains a `lookupInstanceId(stateToken)` method (additive; no breaking change to callers). `CredentialDialog` footer shows Connect / Reconnect for OAuth2 instances in edit mode.

- 8285ec0: `CredentialTypeRegistry` now accepts named sources with priority shadowing (parity with `McpServerCatalog`). Sources are ordered `plugin` < `config` < `controlPlane`; higher-priority sources shadow lower ones, lower-priority duplicates are ignored, and both cases log a warn.

  `applyControlPlaneOverrides` is removed. Control-plane payload now flows through `mergeDefinitions("controlPlane", …)` and can add new types — not just override existing ones. Plugins/config use `merge(source, types)` for full credential types.

  `McpRegistryFetcher` is removed; `ControlPlaneCatalogFetcher` is the single control-plane catalog poller and now merges credential-type definitions in addition to MCP server declarations and OAuth app catalog entries.

- 8285ec0: Declare Gmail MCP server via plugin source (standalone framework). Add mcpServers to DefinePluginOptions and thread it through createPlugin. Add gmail MCP server declaration to core-nodes-gmail plugin. Break host↔gmail cycle by removing gmail from host devDependencies.
- 8285ec0: feat(host/audit): workflow audit retention + tier-gated emission (Sprint 14 Story 06)
  - WorkflowAuditLogPruneScheduler: deletes WorkflowAuditLog rows older than 90 days (CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS override)
  - TelemetryRetentionTimestampFactory: hard-coded defaults (span 7d, artifact 3d, metric 30d) so telemetry retention works out-of-box with no env vars required

- 8285ec0: Runtime DI parity: hoist TypeInfo registrar into AppContainerFactory so CLI runs get the same DI graph as the HTTP host. Add codemation run workflow CLI command that dispatches StartWorkflowRunCommand and polls until terminal status.
- 8285ec0: Add internal workflow introspection endpoints (`GET /internal/workflows` and `GET /internal/workflows/:workflowId`) protected by HMAC pairing-secret middleware. These allow the concierge agent to enumerate workflow summaries and fetch individual workflow DAGs (nodes + edges) via the paired-fetch channel.
- 8285ec0: Add `POST /internal/workflows/:id/test-run` HMAC-protected endpoint. Runs a workflow once synchronously without requiring it to be active, letting the coding agent verify a workflow before activating it. Body: `{ input?: unknown }`. Returns `{ ok, runId?, output?, error?, durationMs }` with a 30-second timeout.
- 8285ec0: feat(host/audit): RunEvent-driven WorkflowAuditLog persistence (Sprint 13 Story B)

  Adds a workspace-local audit trail that captures run-events as queryable rows.
  - `WorkflowAuditLog` Prisma model with indexes on `(actor_user_id, occurred_at)` and `(workflow_id, occurred_at)`
  - `WorkflowAuditLogWriter` subscribes to `RunEventBus` and persists `nodeCompleted`, `nodeFailed`, `runSaved` (terminal), and `connectionInvocationStarted` events
  - `PrismaWorkflowAuditLogRepository` implements `IWorkflowAuditEmitter` using the workspace Prisma client
  - Emission is best-effort: errors are logged and swallowed so workflow execution is never blocked
  - Only active when `persistence.kind !== "none"`

- 8285ec0: Add WebSocket JWT authentication for managed mode.

  In `auth.kind: "managed"` mode the workspace WebSocket server now requires a CP-signed JWT
  passed as `?token=<jwt>` in the upgrade URL. Connections with a missing, expired, wrong-audience,
  or otherwise invalid token are closed immediately with code 4401 ("unauthorized"). Self-hosted
  mode behavior is unchanged.

  New exports: `WebsocketAuthenticator` interface (types), `ManagedWebsocketAuthenticator` class.
  The `JwksCache` instance is shared between the HTTP JWT verifier and the WS authenticator so
  key rotation propagates to both transports without a restart.

- 8285ec0: Add LocalOAuthFlowExecutor for framework (OSS/standalone) mode. Reads clientId from the credential instance's publicConfig and clientSecret from its secret material; builds PKCE-protected consent URLs; exchanges auth codes and refresh tokens directly against the provider's token endpoint. Also patches OAuthFlowExecutor.refresh to accept typeId and instanceId alongside the material, since looking up the tokenUrl and app credentials requires the instance.
- 8285ec0: Add `GET /api/me` endpoint in managed-auth mode (Story A). Returns `{ userId, workspaceId }` from the bearer JWT principal. Only mounted when `auth.kind === "managed"`.
- 8285ec0: Add ManagedOAuthFlowExecutor for managed (paired) mode. Delegates the OAuth dance to the control plane over HMAC-signed calls, keeping client secrets off the host. AppContainerFactory now selects ManagedOAuthFlowExecutor when pairing is configured and LocalOAuthFlowExecutor otherwise.
- 8285ec0: Add McpConnectionPool — lazy, keyed MCP client pool for managed HTTP connections.

  Pools `experimental_createMCPClient` connections keyed by `(credentialInstanceId, serverId)`.
  Reads bearer tokens fresh from the OAuth2-via-broker credential session at open time.
  Caches `tools/list` results per entry and applies `toolDescriptionOverrides` from the catalog declaration.
  Supports `closeForCredential` (revocation) and `closeAll` (host shutdown).

- 8285ec0: Remove the MCP credential bypass on AI agents. `AIAgent.mcpServers` is now a plain
  `ReadonlyArray<string>` of server ids — the inline `{ credential }` field is gone. Each
  declared server surfaces a standard credential slot on the agent node (key
  `mcp:<serverId>`, label and accepted types from the MCP catalog) and binds through the
  same `CredentialBinding` table as every other slot. At execute time the host resolves the
  binding via `getBinding({ workflowId, agentNodeId, slotKey: mcp:<serverId> })`, then opens
  the MCP pool with the resolved credential instance — no more reading the credential id
  out of the workflow config.

  Breaking — config shape change. Replace:

  ```ts
  mcpServers: {
    gmail: {
      credential: "<instanceId>";
    }
  }
  ```

  with:

  ```ts
  mcpServers: ["gmail"];
  ```

  Then bind the credential through the canvas credential dropdown before activating the
  workflow, the same way trigger credentials are bound. The `McpServerBindings` /
  `McpServerExplicitBinding` types are removed from `@codemation/core`;
  `AgentMcpIntegration.prepareMcpTools` now takes `{ workflowId, agentNodeId, serverIds }`.

- 8285ec0: Replace `McpServerDeclaration.credentialKind` / `credentialTypeId` / `oauthAppKey` with `acceptedCredentialTypes?: ReadonlyArray<string>`, matching the `CredentialRequirement.acceptedTypes` shape. Absent or empty array means no credential required. Gmail MCP declaration now uses `["oauth.google.gmail"]`, the same type as the Gmail trigger node.
- 8285ec0: Add `McpServerDeclaration` type and `McpServerCatalog` service (Story 7).
  - `@codemation/core` exports `McpServerDeclaration` and `McpServerTransport` from `packages/core/src/contracts/mcpTypes.ts`.
  - `CodemationPlugin` gains an optional `mcpServers?: ReadonlyArray<McpServerDeclaration>` field.
  - `CodemationConfig` gains an optional `mcpServers?: ReadonlyArray<McpServerDeclaration>` field (also threaded through `AppConfig` and `DefineCodemationAppOptions`).
  - `McpServerCatalog` in `packages/host/src/mcp/` merges declarations from three sources (`plugin`, `config`, `controlPlane`) with deterministic precedence and validation (id regex, stdio gate, credential requirements).
  - `CodemationPluginDiscovery.isPluginConfig` now recognises `mcpServers`-only plugins.
  - Plugin registrar and app container factory wire catalog merge on startup.

- 8285ec0: Add `McpRegistryFetcher` — installation-side polling service that fetches `GET /internal/registry/mcp-servers` from the control plane via the paired HMAC channel on startup and on a configurable interval (default 5 minutes), merging results into `McpServerCatalog` as source `"controlPlane"` (Story 13).
- 8285ec0: Wire `ControlPlaneCatalogFetcher` into app bootstrap so credential-type overrides fetched from the control plane take highest precedence in `CredentialTypeRegistryImpl` (control plane > consumer config > framework default). Add `applyControlPlaneOverrides` to `CredentialTypeRegistryImpl` — full replacement per typeId, preserving runtime callbacks.
- 0082ab5: Adds an `inspectorSummary` hook on node configs (and `defineNode({ inspectorSummary })` for plugin-author nodes). Returns 2–6 short label/value pairs that describe what the node will do at design time — model + prompt for an agent, method + URL for an HTTP call, schedule + timezone for a cron, etc. Surfaced in the workflow editor's node-properties panel as a new "Configuration" section that renders before any run telemetry exists. Hidden when no rows are produced; node configs that don't implement the hook contribute nothing. Built-in nodes will fill these in across follow-up PRs.
- 8285ec0: Remove legacy OAuth connect code path. `OAuth2ConnectService` and its `getAuthRedirect` / `handleCallback` methods are deleted; the `/api/oauth2/auth` route and the duplicate `/api/credentials/oauth/callback` route are removed. The canonical flow is now exclusively `OAuthFlowExecutor` (`LocalOAuthFlowExecutor` / `ManagedOAuthFlowExecutor`) via `POST /api/credentials/oauth/start` and `GET /api/oauth2/callback`. Redirect-URI resolution is extracted to a dedicated `OAuth2RedirectUriResolver`. `ApiPaths.oauth2Auth()` and `ApiPaths.credentialOAuthCallback()` are removed; the client now requires the server-canonical redirect URI from `ApiPaths.oauth2RedirectUri()` before starting the flow.
- 8285ec0: Add `CredentialOAuth2MaterialReader` — a host service that reads stored OAuth2 material and proactively refreshes the access token via `OAuthFlowExecutor.refresh` when it's past expiry (or within a 60-second lead window). Re-encrypts and saves the refreshed material back so subsequent reads find a fresh token.

  Wired into `McpConnectionPool` immediately: MCP HTTP transport had no SDK-level 401-and-refresh path (the Gmail trigger doesn't hit this because `googleapis.OAuth2Client` refreshes internally — that was the exception, not the rule). Before this change, the MCP pool happily sent expired tokens and the workflow failed with `401 — Request had invalid authentication credentials` about an hour after the user connected.

  Concurrent reads share a single in-flight refresh per `instanceId` so the refresh token isn't exchanged twice in parallel. If the refresh call itself fails (e.g. revoked refresh token), the reader logs a warn and returns the stale material — the caller's downstream 401 is what surfaces the actual reconnect-required condition.

- 8285ec0: Add `OAuth2ViaBrokerCredentialTypeFactory` — framework credential type (`host.oauth2-via-broker`) that reads the current access token from the local credential store (populated by the broker push endpoint) and injects `Authorization: Bearer <token>` on requests. Satisfies Story 8: zero credential-type code per new SaaS integration.
- 8285ec0: Introduce a cross-platform `ProcessRunner` seam (interface + execa-backed `ExecaProcessRunner`) exported from `@codemation/host/server`, registered in `AppContainerFactory` under `ApplicationTokens.ProcessRunner`. Migrate every CLI site that previously spawned bare external commands (`pnpm exec next dev` and the packaged Next UI in `DevCommand`, `pnpm exec next start` in `ServeWebCommand`, `pnpm --filter … dev` in `WorkspacePluginDevProcessCoordinator`, `pnpm exec prisma migrate deploy` in `PrismaMigrateDeployInvoker`) so Windows finds `pnpm.cmd` / `pnpm.ps1` shims via execa's PATH resolution instead of erroring with ENOENT. Replace the bash-only `realpath "$(command -v pnpm)"` lookup in `packages/host/scripts/generate-prisma-clients.mjs` with an `execaSync("pnpm", ["root", "-g"])` probe. Fix the root `dev:framework` script's single-quoted command tokens (broken on Windows `cmd.exe`) by switching to escaped double quotes so it works on cmd, PowerShell, bash and zsh.
- 8285ec0: Remove deprecated broker-era MCP fields: `NeedsReconsentEvent.oauthAppKey`, shorthand `McpServerBindings` string array form, and `AgentMcpIntegrationImpl.autoResolveCredential`. Explicit binding (`{ serverId: { credential: "<instanceId>" } }`) is now the only supported form — eliminating ambiguity when multiple credential instances of the same type exist.
- 8285ec0: Remove the `host.oauth2-via-broker` credential type and all related broker-upsert machinery. The broker is now an implementation detail of `ManagedOAuthFlowExecutor`; the credential type catalog only contains mode-agnostic types.
- 8285ec0: Remove `RemoteOAuthRefreshDelegate` and its DI registration. The only refresh path is now `OAuthFlowExecutor`. `McpConnectionPool` uses a local inline type instead of importing from `OAuth2ViaBrokerCredentialTypeFactory`.
- 8285ec0: feat(host/binary): S3BinaryStorage implementation + boot connectivity check (Sprint 15 Story 03)

  Adds `S3BinaryStorage` — a Scaleway-compatible S3 implementation of `BinaryStorage` using
  `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` (multipart for large payloads). Key scheme:
  `<workspaceId>/<runId>/<binaryId>`.

  Runtime selection is controlled by `BINARY_STORAGE_KIND` env var (`"local"` default | `"s3"`).
  When `"s3"`, all `BINARY_STORAGE_S3_*` vars are required and validated at boot. A `HeadBucket`
  connectivity check fails loudly on startup if the bucket is unreachable.

  Extends `BinaryStorage` interface (core) with `deleteMany(keys)` and `listByPrefix(prefix)` for
  bulk-delete (1000-key S3 batching) and workspace-prefix enumeration (GDPR erasure). All existing
  implementations (`InMemoryBinaryStorage`, `LocalFilesystemBinaryStorage`, `UnavailableBinaryStorage`)
  updated with correct implementations.

- 8285ec0: fix(security): engine activation budget + retry ceiling + SSRF allowlist + HKDF cipher + pairing entropy (Sprint 14 Story 09)

  **Engine / retry fixes (already implemented in Sprint 13/14 — tests added here):**
  - `RunContinuationService` uses `EngineExecutionLimitsPolicy.defaultMaxNodeActivations` (100,000) as the fallback, not `Number.MAX_SAFE_INTEGER`.
  - `InProcessRetryRunner` enforces a hard ceiling of 10 retry attempts via `HARD_MAX_RETRY_ATTEMPTS`; workflow-declared values above this are clamped with a warning log.

  **SSRF allowlist (`@codemation/core-nodes`):**
  - New `SsrfGuard` class DNS-resolves the target host before any outbound HTTP call and throws `SSRFBlockedError` if any resolved address falls in RFC-1918 (10/8, 172.16/12, 192.168/16), link-local (169.254/16), or loopback (127/8, ::1) ranges.
  - `HttpRequestExecutor` now accepts `SsrfGuard` as an injected collaborator (4th constructor arg). All composition roots updated.
  - `HttpRequestSpec.allowPrivateNetworkTargets` opt-in flag allows trusted workflows to bypass SSRF protection.
  - New `SSRFBlockedError` class with `resolvedIp` field for structured error handling.

  **HKDF cipher key derivation (`@codemation/host`) — BACKWARDS-INCOMPATIBLE:**
  - `CredentialSecretCipher` switches from raw SHA-256 to HKDF-SHA-256 for AES key derivation.
    - HKDF salt: `"codemation/credential-cipher/v1"`, info: `"aes-256-gcm-key"`.
    - Input (`CODEMATION_CREDENTIALS_MASTER_KEY`) must now be a base64-encoded 32-byte value.
  - New `schemaVersion: 2` for all new encryptions. Existing `schemaVersion: 1` records can still be decrypted (v1 SHA-256 read-path retained for migration).
  - **Migration**: Re-bind affected credentials in the UI (which re-encrypts with the new HKDF key).
  - See migration guide below.

  **Pairing secret entropy validation (`@codemation/host`):**
  - `PairingConfigFactory` now throws at boot when `WORKSPACE_PAIRING_SECRET` is present but does not decode to exactly 32 bytes from base64.
  - Error message includes `openssl rand -base64 32` hint for generating a valid secret.

  ***

  ### Migration guide — CODEMATION_CREDENTIALS_MASTER_KEY

  **Who is affected:** Any deployment that has `CODEMATION_CREDENTIALS_MASTER_KEY` set and has encrypted credentials stored in the database.

  **What changed:** The key derivation function changed from `SHA-256(rawString)` to `HKDF-SHA-256(base64Decode(rawString), salt, info)`. The input key must now be exactly 32 bytes when base64-decoded.

  **Migration steps:**
  1. Generate a new 32-byte key: `openssl rand -base64 32`
  2. Set `CODEMATION_CREDENTIALS_MASTER_KEY` to this new value.
  3. Re-bind each credential in the Codemation UI (open the credential, re-enter secrets, save). This re-encrypts with the new HKDF-derived key at `schemaVersion: 2`.
  4. Credentials not yet re-bound will throw `CredentialKeyRotatedError` when accessed — the existing key-rotation error handling applies.

  **Rollback:** Keep the old key value in a safe location. To roll back, restore the old `CODEMATION_CREDENTIALS_MASTER_KEY` value — the v1 SHA-256 decrypt path is retained in this release.

- 8285ec0: Add `@codemation/managed-auth` package and `auth.kind: "managed"` support in `@codemation/host`.

  `@codemation/managed-auth` is a new publishable package containing the JWKS cache and EdDSA JWT verifier used by managed-mode workspaces. It has no dependency on `@codemation/host` or `@codemation/core` and is intentionally self-contained so the closed-source workspace-mcp can install it from the public registry.

  `@codemation/host` gains `auth.kind: "managed"` — a new auth mode where Better Auth is not mounted, the workspace verifies CP-signed JWT bearers, and a single-origin CORS allowlist is enforced via `CP_WEB_ORIGIN`. Boot-time guard ensures all required env vars are present before startup.

- 8285ec0: feat(story-11): Wire MCP catalog into agent — explicit and shorthand binding, scope validation, pool integration, telemetry, and runtime 403 detection
  - `@codemation/core`: `AgentMcpIntegration` interface + token, `McpServerBindings` types, `NeedsReconsentEvent`, `AgentBindError`, `NoOpAgentMcpIntegration` fallback, `CodemationTelemetryAttributeNames.mcpServerId/mcpToolName`
  - `@codemation/core-nodes`: `AIAgentConfig` + `AIAgent` extended with `mcpServers` and `pinnedMcpTools`; `DeferredMetaToolStrategy.ownsToolName` covers MCP tools; `AIAgentNode` injects `AgentMcpIntegration` and strips AI SDK auto-execute from strategy tools
  - `@codemation/host`: `AgentMcpIntegrationImpl` — resolves bindings, validates scopes, opens pool, wraps tool execute with telemetry spans and 403/permission error detection

- 8285ec0: Add `managed` scaffold template and workflow auto-discovery config fields
  - New `create-codemation` template `managed` — pre-configured for managed mode with PostgreSQL, CP-JWT auth, and workflow auto-discovery from `./src/workflows`.
  - `defineCodemationApp` now accepts `workflowsDir` (maps to `workflowDiscovery.directories`), `database.urlEnv`, `execution.modeEnv`, and `execution.redisUrlEnv` for env-resolved config values.
  - `CodemationConfigNormalizer` enforces managed-mode invariants: PostgreSQL required, at least one workflow source required.
  - New `WorkflowDirectoryDiscoverer` class for walking a directory and collecting exported workflows with test-file exclusion.
  - `WorkflowModulePathFinder` now excludes `*.test.*` and `*.spec.*` files from discovery.

- 8285ec0: Add workspace pairing primitives to `packages/host/src/pairing/`: `HmacRequestSigner`, `PairedFetch` (outgoing signed requests to the control plane), `IncomingHmacVerifier` (verify signed requests from the control plane), `InternalHmacAuthMiddleware`, and `InternalPingRegistrar`. These enable HMAC-SHA256 authenticated channels between a workspace installation and the control plane per the protocol defined in `docs/pairing-protocol.md`. Also extends `CodemationHonoApiApp` to mount optional `/internal/*` routes via the new `InternalHonoApiRouteRegistrar` token.
- 51b728d: Stream telemetry spans over WebSocket transport, eliminating HTTP polling.

  **Backend (@codemation/host):**
  - Added `TelemetrySpanPublisher` interface + `NoOpTelemetrySpanPublisher` default.
  - Added `telemetryEvent` variant to `WorkflowWebsocketMessage` carrying `TelemetrySpanUpsert`.
  - New `TelemetrySpanWebsocketRelay` class publishes each span upsert to a per-run room (`run:<runId>`) after it is committed to persistent storage.
  - `OtelExecutionTelemetryFactory` injects `TelemetrySpanPublisher` (defaults to no-op when unregistered).
  - `StoredTelemetrySpanScope.upsert()` calls the publisher after the span store write so reconnect HTTP catch-up and WS pushes are consistent.

  **Frontend (@codemation/next-host):**
  - `useWorkflowRealtimeInfrastructure` handles `kind: "telemetryEvent"` messages via `applyTelemetrySpanEvent`, which merges spans into the `telemetry-run-trace` query cache by `spanId` (deduped, sorted by `startTime`).
  - New `retainRunSubscription` API manages per-run WS room subscribe/unsubscribe with reference counting.
  - Auto-unsubscribe from run rooms when the tab is hidden for ≥ 5 minutes (Page Visibility API); re-subscribes on tab return.
  - `useTelemetryRunTraceQuery` drops HTTP polling (`refetchInterval: false`); refetches once on WS reconnect for catch-up.
  - `resolveTelemetryTraceRefetchIntervalMs` is now a no-op (always returns `false`) — retained for call-site compatibility.

### Patch Changes

- 8285ec0: Add activation-time OAuth scope validation: workflows with bound OAuth credentials are now rejected at activation if the granted scopes do not cover the required scopes for the credential type.
- 8285ec0: Add a `statusLabel` field to `ConnectionInvocationRecord` / `ConnectionInvocationAppendArgs` so connection invocations can carry a short human-readable description of what they are doing (e.g. `"calling search_messages"`). The engine-side `NodeRunStateWriter` persists it; the canvas-side mirror picks it up via the standard patch projection.

  Wire per-MCP-tool-call lifecycle invocations through `AgentMcpIntegration`. `prepareMcpTools` now accepts an optional `appendMcpInvocation` callback (plus the agent activation / iteration / item / parent-invocation context). When the host-side `AgentMcpIntegrationImpl` wraps a tool's `execute`, it emits a `running` record with `statusLabel: "calling <toolName>"` and a matching `completed` or `failed` record; the existing telemetry span and 403 `NeedsReconsentEvent` paths are preserved. `@codemation/canvas-core` exposes a `CurrentStatusLabelSelector` and `WorkflowCanvasNodeData.currentStatusLabel`; `@codemation/canvas` renders the latest non-empty label as a sub-line under the node card. The two capabilities work together: MCP tool calls under an agent now stream the same invocation events the LLM and node-backed tool paths already emit, and the canvas surfaces the running label per-node.

- 8285ec0: Fix workflow detail screen hydration mismatch caused by overlay siblings (tabs, run button, error banner, realtime badge) being rendered conditionally on controller state that diverges between SSR and a warm React Query client cache. Overlay siblings are now gated behind the same `hasMounted` flag as the canvas root.

  Render AIAgent MCP-server attachments in the canvas. `WorkflowDefinitionMapper` (the server-side mapper that feeds `/api/workflows/:id`) now passes an `McpServerResolver` backed by the host's `McpServerCatalog` to `AgentConnectionNodeCollector.collect`, so virtual connection nodes for declared `mcpServers` are emitted alongside the LLM and tool children. The MCP descriptor itself carries `icon: "lucide:plug"` and `lucide:plug` is added to the curated `WorkflowCanvasLucideIconRegistry` so MCP servers render with a distinct icon on the synchronous zero-HTTP path.

- 8285ec0: Add optional `subjectName?: string` to `ConnectionInvocationRecord` and `ConnectionInvocationAppendArgs` — a stable identifier for the thing an invocation acts on that persists across status transitions. The MCP integration's `wrapToolExecutes` sets it to the tool name on every transition (running / completed / failed), so the inspector's tool-call timeline entries can render `"Tool call · <toolName>"` for MCP servers (which expose many tools through a single connection node) instead of an opaque `"Tool call"`.

  For node-backed agent tools, the parent connection node id already encodes the tool name — `subjectName` stays unset there and the inspector renders the existing `"Tool call"` title unchanged.

  `statusLabel` (the running-only sentence rendered on the canvas card sub-line) is unchanged; `subjectName` is the persistent structural sibling used by the inspector.

- 8285ec0: Coverage Phase 2: testkits (LoggerTestKit, McpTestKit, CoreNodesTestContextFactory,
  TelemetryTestKit, GmailTestKit, AppConfigFixturesFactory, HookTestkit), per-package
  vitest coverage thresholds, and new tests on previously zero-coverage critical paths
  (mergeNode, switchNode, waitNode, connectionCredentialNode, canvas-lib pure, hook smoke).
  No production code changes.
- e4d3e1a: perf(host): reject workflow runs immediately when required credential slots are unbound

  `StartWorkflowRunCommandHandler` now calls
  `CredentialBindingService.assertRequiredCredentialsBound` before queuing any
  node activations. The check does a single DB query (all bindings for the
  workflow) and walks every slot including deeply-nested ones in AI agent nodes
  (language model, node-backed tools, nested agents) via
  `WorkflowCredentialNodeResolver.listSlots`. If any required slot has no
  binding the request fails with a 400 before the run record is created, so the
  user sees a clear error message instead of waiting for the run to start and
  then fail several seconds later.

- 8285ec0: Fix `/collections` 500 on consumer dev startup: `no such table: collections_<name>`. The CLI sets `CODEMATION_SKIP_STARTUP_MIGRATIONS=true` because it runs Prisma migrations ahead of the runtime, but the same env var was also gating consumer-defined collection-schema sync inside `FrontendRuntime.start` (and `WorkerRuntime.start`). Only the runtime knows about collections declared in `codemation.config.ts`, so the CLI can never run that sync on the runtime's behalf. The two gates are now separate: Prisma migrations remain skip-able via the env var, but collection sync always runs at runtime startup when collections are declared and persistence is configured.
- 8285ec0: fix(host/http): generic 500 error envelope + ManagedMeHonoApi error boundary (Sprint 14 Story 08)
  - `ServerHttpErrorResponseFactory.fromUnknown` now returns `{ error: "Internal server error" }` for unexpected errors instead of leaking `error.message` to the client (Prisma messages, stack fragments, internal state).
  - `ManagedMeHonoApiRouteRegistrar.register` wraps `sessionVerifier.verify()` in try/catch; a thrown JWT verification error now returns 401 instead of propagating as an unhandled 500.
  - Tests updated: `telemetryHttpRouteHandler.test.ts` reflects generic envelope; new test in `ManagedMeHonoApiRouteRegistrar.test.ts` asserts 401 on `verify()` throw; new `ServerHttpErrorResponseFactory.test.ts` asserts generic message does not contain internal details.

- 8285ec0: test(host/persistence): cascade-on-delete integration tests (Sprint 13 Story C)

  Adds `cascadeOnDelete.integration.test.ts` covering all 8 `onDelete: Cascade`
  relationships declared in `schema.postgresql.prisma`. Each test creates a parent
  row and N child rows, deletes the parent, and asserts the child count drops to 0.

  Relationships tested:
  - `RunWorkItem → Run`
  - `ExecutionInstance → Run`
  - `RunSlotProjection → Run`
  - `TestAssertion → Run`
  - `TestAssertion → TestSuiteRun`
  - `UserInvite → User`
  - `Account → User`
  - `Session → User`

  Gaps noted (no cascade declared in schema, no schema changes made):
  - `Credential*` tables (CredentialSecretMaterial, CredentialOAuth2Material, etc.)
    share `instanceId` with `CredentialInstance` but have no `@relation onDelete:
Cascade`. GDPR right-to-erasure risk.
  - No `Workspace` model exists in `schema.postgresql.prisma`.

- 8285ec0: test(host): increase unit test coverage to ≥90% (Sprint 14 Story 13)

  Adds 30+ new unit test files and extensions covering previously untested logic in
  `@codemation/host`. New test suites include:
  - `InMemoryCredentialStore` — full CRUD + OAuth2 state/material lifecycle
  - `CredentialSessionServiceImpl` — getSession, createSessionForInstance, evict\*
  - `SetPinnedNodeInputCommandHandler` — 404/403/decode/null-items paths
  - `ReplaceMutableRunWorkflowSnapshotCommandHandler` — 400/404/403/success
  - `ReplayWorkflowNodeCommandHandler` — 404/403/workflow-not-found/decode/mode
  - `GetWorkflowRunDetailQueryHandler` — undefined detail, empty rollups, cost join
  - `WorkflowRunRetentionPruneScheduler` (extended) — both-disabled early return, listRuns fallback, binary storage key fallback, artifact storage key deletion
  - `WorkflowAuditLogPruneScheduler` — disabled, custom retention, delete path
  - `ManagedCorsMiddleware` — preflight allow/deny, non-preflight with/without CORS headers
  - `InMemoryDomainEventBus` — publish routing, metadata error, empty handlers
  - `WorkflowRunRepository` wrapper — load/save/listRuns/deleteRun with URL decoding
  - `ApiPaths` — all static path methods
  - `CodemationConfigNormalizer` — register callback, managed-mode constraints, DefinedCollection unwrapping
  - `LocalFilesystemBinaryStorage` — write/read/stat/delete/deleteMany/listByPrefix/path-escape
  - `StoredTelemetrySpanScope` (extended) — addSpanEvent, attachArtifact no-op path, asNodeTelemetry view
  - `TelemetryQueryService` (extended) — empty-spans early returns, cachedInputTokens/reasoningTokens branches

  Coverage exclusions added for infrastructure-only files that require live
  connections (SQLite, S3, module loader, internal HMAC wiring).

- 8285ec0: test(host): push @codemation/host coverage to ≥90% lines (Sprint 16 Story 01)
- 8285ec0: Surface unbound credential errors to workflow run dialog by fixing the swallowed catch block in CredentialBindingService.assertRequiredCredentialsBound.
- 8285ec0: fix(credentials): MCP server credential slots now appear in the properties panel

  `WorkflowCredentialNodeResolver` was calling `AgentConnectionNodeCollector.collect()` without the `mcpServerResolver` argument in both `addRecursiveAgentSlots` and `findRecursiveConnectionNode`, so MCP attachment nodes (e.g. Gmail) were never included in the credential slot list. The early-return guard in `findRecursiveConnectionNode` also rejected MCP node IDs because it only checked for LLM and tool connection node ID patterns. Injecting `McpServerCatalog` into the resolver and passing it as the resolver to all three `collect()` call sites fixes both paths.

- 8285ec0: feat(host): warn at startup when pairing env vars are absent (Sprint 14 Story 05)

  When WORKSPACE_ID, WORKSPACE_PAIRING_SECRET, or CONTROL_PLANE_URL are not set
  at boot, the host now logs a named warning (codemation.pairing) listing the
  missing variable names instead of silently skipping pairing registration.
  This makes misconfigured managed-mode deployments immediately visible in logs.

- 8285ec0: feat(host/storage): artifact-to-object-storage + Run snapshot dedup (Sprint 14 Story 07)
  - TelemetryArtifact payloads > 64 KB are now offloaded to BinaryStorage (payloadStorageKey column)
    instead of stored inline in Postgres TEXT columns. Expired artifacts with storage keys have their
    BinaryStorage blobs deleted during prune.
  - Run snapshot deduplication: new WorkflowSnapshot table keyed by (workflowId, snapshotHash).
    PrismaWorkflowRunRepository.createRun/save call findOrCreate to share identical snapshot JSON
    across runs instead of storing redundant copies per run.
  - Schema migrations added for both PostgreSQL and SQLite (with backfill of existing rows).

- 8285ec0: feat(host/security): HMAC verifier + credential cipher trust-boundary tests and `CredentialKeyRotatedError` for key rotation (Sprint 13 Story E framework-side).
  - New `CredentialKeyRotatedError` thrown by `CredentialSecretCipher.decrypt` when the stored `encryptionKeyId` does not match the active master key — explicit fail-loud on key rotation.
  - `CredentialSecretCipher` updated: decrypt now checks key id before attempting decryption, with missing-env → key-id-mismatch → auth-tag-failure ordering.
  - `IncomingHmacVerifier` now throws explicitly when `pairingSecret` is empty (prevents silent signature-mismatch on misconfiguration).
  - 8 unit tests for `IncomingHmacVerifier` (valid/wrong-workspace/tampered-body/tampered-header/skewed-timestamp/missing-secret-throws/replay/nonce-per-instance).
  - 4 integration tests for `InternalHmacAuthMiddleware` hitting `/internal/ping` (valid 200/tampered 401/wrong-workspace 401/replay 401).
  - 7 unit tests for `CredentialSecretCipher` (round-trip/tamper/missing-env-encrypt/missing-env-decrypt/IV-randomness/keyId-format/key-rotation-throws-CredentialKeyRotatedError).
  - Fix pre-existing TS error: `ManagedAuthTestJwks` `KeyLike` → `CryptoKey` (jose v6 dropped the alias).
  - New `docs/security-boundary.md` documenting HMAC trust boundary, in-memory nonce cache semantics, and cipher key rotation contract.

- 8285ec0: Allow SQLite in managed mode. The Sprint 3 Story 6 normalizer rule that
  forced PostgreSQL when `auth.kind === "managed"` is removed for now —
  the provisioner doesn't inject `DATABASE_URL` into spawned workspaces,
  so the constraint blocked local provisioning. The managed scaffold
  template now defaults to a per-workspace SQLite file.
- 8285ec0: `McpConnectionPool` now reads OAuth material directly from the credential store + cipher instead of casting the credential session to an invented `McpOAuth2Session` shape. The previous path called `CredentialSessionServiceImpl.createSessionForInstance<McpOAuth2Session>(...)`, which was an unsafe generic cast — credential types' actual session shapes (e.g. `GmailSession`) don't implement `applyToRequest`, so the call threw `TypeError: session.applyToRequest is not a function` at runtime even though it type-checked.

  The pool now resolves an instance's OAuth2 material via `credentialStore.getOAuth2Material(instanceId)` + `credentialSecretCipher.decrypt(...)` and builds the `authorization: Bearer <accessToken>` header from `material.accessToken` — bypassing the session entirely. Bound MCP credential types are already gated by `McpServerDeclaration.acceptedCredentialTypes` (OAuth2-shape verified at the catalog level), so the material is always available when binding succeeds.

  `CredentialSessionServiceImpl.createSessionForInstance` is removed — it was only kept to feed this dead path. `McpOAuth2Session` (the fictional local type) is deleted.

- 8285ec0: MCP credential slots now live on the MCP connection node, matching ChatModel and Tool
  connection nodes. Each declared `mcpServers` entry materializes an MCP connection node
  and the credential slot is attached to that node with slot key `"credential"` (label
  and accepted types derived from the MCP catalog declaration). The standard credential
  slot traversal picks them up via `AgentConnectionNodeCollector` — no special-case path.

  Removed the agent-owned `mcp:<serverId>` slot key. Removed the `mcpSlotKey(serverId)`
  helper from `@codemation/core` (and its re-export from the type-only `contracts`
  subpath). At runtime, `AgentMcpIntegration.prepareMcpTools` now resolves the binding at
  `(workflowId, ConnectionNodeIdFactory.mcpConnectionNodeId(agentNodeId, serverId), "credential")`.

  Gmail MCP `requiredScopes` trimmed to `["https://www.googleapis.com/auth/gmail.modify"]`
  — `gmail.modify` is a superset of `gmail.readonly` + `gmail.send` for messages, threads,
  drafts, and labels, so the previous list was redundant.

- 8285ec0: fix: validate edge output ports against declared node ports at load time

  Adds `WorkflowEdgePortValidator` to `@codemation/core`. The validator checks that every edge's `from.output` port is declared by the source node's `declaredOutputPorts`; nodes without declared ports are treated as unconstrained (legacy behaviour).

  The validator is wired into `WorkflowDefinitionExportsResolver` in `@codemation/host`, which is the common chokepoint for both the `CodemationConsumerConfigLoader` and `CodemationConsumerAppResolver` load paths. On violation, all errors are reported at once so an agent can self-correct in a single pass.

  `WorkflowElkPortInfoResolver` in `@codemation/canvas-core` is tightened to render _exactly_ the declared ports (plus the synthetic `error` port when applicable) when a node has `declaredOutputPorts`, preventing phantom handles from rogue edges on the canvas. Legacy nodes without declared ports continue to infer ports from edges as before.

  Root cause: an LLM agent created an `If` workflow node (declares `["true", "false"]`) with a rogue edge using `output: "main"`, which the canvas unioned into the port list, producing a phantom third handle.

- 8285ec0: Reduce the number of worker processes/threads spawned by the test suite so it doesn't throttle other processes on the developer's machine. Root `turbo.json` concurrency drops 12 → 4 (cross-package parallelism) and every vitest config in `tooling/vitest/*` and `packages/host/*.config.ts` drops `maxWorkers` 2 → 1 with `fileParallelism: false`. Worst-case worker count was 12 × 2 = 24 simultaneous, now 4 × 1 = 4. CI throughput will be lower but local `pnpm test` no longer pegs the box.
- 8285ec0: Add integration test coverage for managed-auth pipeline (Sprint 13 Story F).
  - `managedAuth.integration.test.ts`: 5 new `/api/me` end-to-end cases (happy path, anonymous, tampered, expired, wrong audience) using a real signed JWT.
  - `managedAuthSqlite.integration.test.ts`: boot regression guard for `auth.kind: "managed"` + sqlite combination (commit 35b8732c fix).
  - `ManagedAuthTestJwks` testkit: reusable test EdDSA keypair + JWKS server helper.

- 8285ec0: fix(credentials): require ownership for ?withSecrets=1 (Sprint 14 Story 03)

  `CredentialHttpRouteHandler.getCredentialInstance` now enforces workspace
  ownership when `?withSecrets=1` is requested. In managed-auth mode a principal
  with a `workspaceId` that differs from the installation's `pairingConfig.workspaceId`
  receives 403 Forbidden. Local-auth mode (no pairingConfig) is unchanged.

- 8285ec0: fix(security): fail-closed on null principal for ?withSecrets=1 (Sprint 14.5 fix pass)

  `CredentialHttpRouteHandler.getCredentialInstance` now returns 403 when the session verifier returns null (unauthenticated request) and `?withSecrets=1` is present, closing the silent pass-through gap that existed in local-auth mode.

- 8285ec0: fix(sprint-14.5/storage+ssrf): S3 403-not-as-404 + KIND unknown throw + CGN SSRF block + audit prune interval env (Sprint 14 fix pass)
  - `S3BinaryStorage.isNotFoundError`: remove `statusCode === 403` from not-found check; propagate 403 (misconfiguration) instead of silently treating it as missing.
  - `AppContainerFactory.createBinaryStorage`: throw `Error` for unknown `BINARY_STORAGE_KIND` values (e.g. `"gcs"`) instead of silently falling back to local storage.
  - `WorkflowAuditLogPruneScheduler`: read interval from `CODEMATION_AUDIT_PRUNE_INTERVAL_MS` (dedicated env); fall back to `CODEMATION_RUN_PRUNE_INTERVAL_MS` then static default.
  - `SsrfGuard.isPrivateIPv4`: add `100.64.0.0/10` (Carrier-Grade NAT, RFC 6598) to blocked ranges.

- 8285ec0: Remove the `development` export condition from `@codemation/canvas`, `@codemation/core`, and `@codemation/host` package.json exports. Module resolution now consistently uses the built `dist/` regardless of `NODE_ENV`.

  **Why:** the `development` condition is auto-applied by bundlers (Next.js dev mode, Vite dev, etc.) and was making every cross-repo monorepo consumer fall through to TypeScript source. For the framework's own `@codemation/next-host`, this was fine — turbo's `dev` already runs `tsdown --watch` on these packages so dist is always fresh in dev. For external consumers (notably the managed control plane), it caused multi-hundred-file recursive source compiles on every cold page load.

  **Impact:** zero behavior change for normal users (they consume published `dist/`). Framework monorepo devs editing canvas/core/host source still see live updates as long as `tsdown --watch` is running for the package — which is what `pnpm dev` (turbo) orchestrates by default. If you're running an app in isolation without the package's watch task, you now need to start it explicitly.

- 8285ec0: Make the unit-test suite pass on Windows.
  - `PrismaMigrationDeployer`: read `CODEMATION_PRISMA_CLI_PATH`, `CODEMATION_PRISMA_CONFIG_PATH`, `CODEMATION_HOST_PACKAGE_ROOT` from the `env` argument passed to `deploy(...)`/`deployPersistence(...)` instead of `process.env` at call time. Tests can now pass their CLI path through the deployer's existing `env` parameter rather than mutating shared `process.env`, removing the cross-file env-race that flaked SQLite deployer tests under thread-pool parallelism.
  - `NodeInspectorTelemetryPresenter` + `DashboardCostAmountFormatter`: pin currency formatting to `en-US` with `currencyDisplay: "narrowSymbol"` so Node ICU versions produce `"$0.000039"` rather than `"US$0.000039"`.
  - `DashboardAiUsageSummaryCard`: pin token-count formatting to `en-US` so the dashboard renders `"1,840"` regardless of system locale.

  Companion test changes (not user-visible): test fixtures pass the test-only env via the deployer's `env` argument, several CLI tests wrap expected paths in `path.resolve(...)` so Windows backslash output matches, `PrismaMigrationDeployer` recovery test moved to its own file (libsql native state from earlier tests in the same file leaked into the recovery flow on Windows), and `vitest.unit.config.ts` switched to the forks pool for libsql native-module isolation across files.

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
- Updated dependencies [7b50018]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [8285ec0]
- Updated dependencies [e4d3e1a]
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
- Updated dependencies [f344d6d]
  - @codemation/core-nodes@0.8.0
  - @codemation/core@0.11.0
  - @codemation/eventbus-redis@0.0.38
  - @codemation/managed-auth@0.1.0

## 0.6.0

### Minor Changes

- [#133](https://github.com/MadeRelevant/codemation/pull/133) [`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384) Thanks [@cblokland90](https://github.com/cblokland90)! - feat: deep-link from parent run to specific subworkflow execution

  Adds `childRunId` to `NodeExecutionSnapshot` so the UI can navigate directly to the
  child run when a `SubWorkflow` node is selected in the execution inspector, instead of
  only linking to the child workflow's editor. Fixes the gap from PR [#131](https://github.com/MadeRelevant/codemation/issues/131).
  - `@codemation/core` (patch): `NodeExecutionSnapshot` gains `childRunId?: RunId`;
    `ExecutionInstanceDto` gains `childRunId?: string`;
    `NodeExecutionStatePublisher` gains optional `setChildRunId` method;
    `NodeExecutionSnapshotFactory` propagates `previous.childRunId` through
    `completed`, `failed`, and `skipped` transitions.
  - `@codemation/host` (minor): `ExecutionInstance` table gains `child_run_id` column
    (nullable, backward-compatible); `PrismaWorkflowRunRepository` persists and reads
    `childRunId` on node-activation snapshots.
  - `@codemation/next-host` (minor): `NodeExecutionSnapshot` type gains `childRunId`;
    `WorkflowExecutionInspectorDetailBody` renders "Open subworkflow run" (with
    `?run=<childRunId>`) when a child run id is present, falling back to
    "Open subworkflow editor" for pre-existing snapshots.

- [#131](https://github.com/MadeRelevant/codemation/pull/131) [`5b509e8`](https://github.com/MadeRelevant/codemation/commit/5b509e83e1e963e0c03cb0cbad018dc1fb0a04c5) Thanks [@cblokland90](https://github.com/cblokland90)! - feat: SubWorkflow editor link, workflow info popover, and child-run navigation
  - **2.3a** — SubWorkflow nodes in the node-properties panel now show an "Open in editor" link that navigates to the referenced workflow. Requires the new `referencedWorkflowId` field added to `WorkflowNodeDto` (populated from `SubWorkflow.workflowId` in `WorkflowDefinitionMapper` and `PersistedWorkflowSnapshotMapper`).
  - **2.3b** — A workflow info popover (ⓘ icon) appears in the detail-page header, showing workflow id, discovery-path segments, trigger type, and active status.
  - **2.4** — When a SubWorkflow node is selected in the execution inspector, an "Open workflow" link appears navigating to that child workflow's editor. Note: jump to the _specific child run_ is not yet possible because the parent's node execution snapshot does not carry the child `runId`; this is a backend follow-up item.

### Patch Changes

- Updated dependencies [[`d283b48`](https://github.com/MadeRelevant/codemation/commit/d283b481f01a1a259d38d25c1482006eff963384), [`e8e3935`](https://github.com/MadeRelevant/codemation/commit/e8e39358a4282e0a780efb428ae0d71d105afd5f)]:
  - @codemation/core@0.10.2
  - @codemation/core-nodes@0.7.1
  - @codemation/eventbus-redis@0.0.37

## 0.5.1

### Patch Changes

- Updated dependencies [[`1f10121`](https://github.com/MadeRelevant/codemation/commit/1f10121a093ef0612a33c873419b032709c9964d), [`c191557`](https://github.com/MadeRelevant/codemation/commit/c19155783a012d293568f55427ae36b31171af11), [`d0f2bd9`](https://github.com/MadeRelevant/codemation/commit/d0f2bd9a670ff80c2e2e12f7c410c63d14c94b55)]:
  - @codemation/core@0.10.1
  - @codemation/core-nodes@0.7.0
  - @codemation/eventbus-redis@0.0.36

## 0.5.0

### Minor Changes

- [#119](https://github.com/MadeRelevant/codemation/pull/119) [`847deb4`](https://github.com/MadeRelevant/codemation/commit/847deb4c42801632bfb970cdb2625cd0755241cb) Thanks [@cblokland90](https://github.com/cblokland90)! - Reset source version line back to 0.x. Earlier releases prematurely jumped these packages to 1.x and 2.x via silent `major` changesets buried under unrelated work; the framework is still in beta. The npm versions 1.x and 2.0.0 are deprecated upstream — consume the 0.x line going forward.
  - `@codemation/core` 2.0.0 → 0.9.0 (continues from 0.8.1)
  - `@codemation/core-nodes` 1.1.0 → 0.5.0 (continues from 0.4.3)
  - `@codemation/host` 1.1.0 → 0.4.0 (continues from 0.3.1)

  `@codemation/agent-skills`, `create-codemation`, `@codemation/cli`, and `@codemation/core-nodes-msgraph` already track 0.x and are unaffected.

  `create-codemation` template dependency ranges updated from `1.x` to `0.x` to track the corrected line.

### Patch Changes

- Updated dependencies [[`847deb4`](https://github.com/MadeRelevant/codemation/commit/847deb4c42801632bfb970cdb2625cd0755241cb)]:
  - @codemation/core@0.10.0
  - @codemation/core-nodes@0.6.0
  - @codemation/eventbus-redis@0.0.35

## 1.1.0

### Minor Changes

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

- [#109](https://github.com/MadeRelevant/codemation/pull/109) [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca) Thanks [@cblokland90](https://github.com/cblokland90)! - OAuth2 plugin authors can now declare `authorizeUrl` / `tokenUrl` (with `{publicFieldKey}` template substitution) directly on a credential type's `auth` definition — no core change required to add a new provider. Migrated `@codemation/core-nodes-msgraph` to use this for Microsoft tenant-templated URLs (fixes "Unsupported OAuth2 provider id: microsoft" on connect).

  Removed dead `@codemation/core-nodes-gmail` devDep from `@codemation/host` and the matching `serverExternalPackages` entry from `@codemation/next-host` so plugin-author `pnpm dev` no longer rebuilds gmail when working on an unrelated plugin.

  Softened the credentials UI's "Not set in host env: …" message: it's now an informational tip with neutral styling (was destructive/error styling), since the field works perfectly fine when filled in manually.

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Foundation for first-class **workflow testing**: a TestTrigger node, an IsTestRun branching node, an Assertion node, a `TestSuiteOrchestrator` service that fans one workflow run per yielded fixture item, host-side persistence (Prisma `TestSuiteRun` + `TestAssertion` tables, repositories, `TestRunnerService`), and a per-suite event tracker that records assertions and node coverage. HTTP routes and the canvas Tests tab (next-host) ship in follow-up slices.

  **What this slice adds**
  - **`@codemation/core` — additive contract changes**
    - `RunExecutionOptions.testContext?: { testSuiteRunId; testCaseIndex }` — set by the orchestrator on each test-case run; threaded through `ExecutionContext` so nodes can read it as `ctx.testContext`. Propagates to subworkflow runs via `ParentExecutionRef.testContext` + `EngineExecutionLimitsPolicy.mergeExecutionOptionsForNewRun`, so assertions emitted by subworkflows land under the correct parent test case.
    - `TriggerNodeConfig.triggerKind?: "live" | "test"` — `"test"` triggers are skipped by `TriggerRuntimeService` (live activation, webhooks, polling) and are only invoked by the orchestrator.
    - `NodeConfigBase.emitsAssertions?: true` — marker the host-side `TestAssertionPersister` (next slice) keys off when subscribing to `nodeCompleted`.
    - New `AssertionResult` type (`pass | fail | error`, plus `score`, `expected`, `actual`, `message`, `details`) — the stable shape every assertion node emits on `main`.
    - New `TestTriggerNodeConfig` + `TestTriggerSetupContext` — author callback signature returns `AsyncIterable<Item>` and exposes credential resolution + an `AbortSignal`.
    - New `RunEvent` kinds: `testSuiteStarted`, `testCaseStarted`, `testCaseCompleted`, `testSuiteFinished` (with terminal status `succeeded | failed | partial | cancelled | errored`).
    - New `TestSuiteOrchestrator` service in `orchestration/` — drives the iterator, applies a per-suite concurrency semaphore (default 4), dispatches one `engine.runWorkflow(...)` per item with `executionOptions.testContext` set, awaits terminal status, and publishes lifecycle events on the existing `RunEventBus`. No persistence, no HTTP — pure engine logic so tests can drive it via in-memory deps.
    - `TestSuiteRunIdFactory`, `AbortControllerFactory` — DI-friendly minters used by the orchestrator.
  - **`@codemation/core-nodes` — three new nodes**
    - **`TestTrigger`** / `TestTriggerNode`: drop on the canvas alongside live triggers. `setup` is a no-op; `execute` is a passthrough. The author's `generateItems` is consumed by the orchestrator.
    - **`IsTestRun`** / `IsTestRunNode`: per-item router with `true` / `false` ports. Routes to `true` iff `ctx.testContext` is set — lets workflows skip real side-effects in test runs (e.g. don't actually send the reply).
    - **`Assertion`** / `AssertionNode`: generic callback-style assertion node. Author returns `Promise<AssertionResult[]>` per item; the node emits one workflow `Item` per result. Sets `emitsAssertions: true` so the host persister can identify it.
    - Declarative shorthands (`StringEqualsAssertionNode`, `JudgeByAgentAssertionNode`) intentionally deferred — the generic callback node covers Phase 1 and the declarative variants compose on top.
  - **`@codemation/host` — persistence + orchestration + HTTP**
    - **Prisma schema**: new `TestSuiteRun` and `TestAssertion` tables in both Postgres and SQLite mirrors. Adds `Run.testSuiteRunId` (FK with `ON DELETE SET NULL`) and `Run.testCaseIndex` (indexed for join + ordering). Workflow definition itself is **not** FK'd — workflows live in code; `TestSuiteRun.triggerNodeName` is snapshotted at creation so historical viewing survives node renames/deletions.
    - **`TestSuiteRunRepository`** + **`TestAssertionRepository`** domain interfaces with Prisma + in-memory adapters.
    - **`TestRunnerService`** (host application layer) — single facade for "start a test suite": creates the persistence row, drives the orchestrator, awaits, finalizes counts + coverage. Subscribes to `RunEventBus.subscribeToWorkflow` only for the lifetime of one suite (no global subscriber, no shared mutable state across concurrent suites).
    - **`TestSuiteRunTracker`** + **`TestSuiteRunTrackerFactory`** — per-suite event accumulator. Two-stage event buffering tolerates inline runners that emit `nodeCompleted` synchronously inside `runWorkflow` (before the orchestrator publishes `testCaseStarted`); without it, fast/in-memory engines drop assertions silently.
    - **`AssertionResultGuard`** — type-guard the tracker uses to skip junk output if a misconfigured `emitsAssertions: true` node emits non-assertion items (defensive, not crash-on-bad-input).
    - **HTTP routes** (Hono, all behind the existing session-verifier middleware):
      - `POST /api/workflows/:workflowId/test-suite-runs` body `{ triggerNodeId, concurrency? }` → 201 with `{ testSuiteRunId, status, totalCases, passedCases, failedCases }`
      - `GET /api/workflows/:workflowId/test-suite-runs` → list summaries
      - `GET /api/test-suite-runs/:id` → detail (including `concurrency`, `nodeCoverage`, `errorMessage`)
      - `GET /api/test-suite-runs/:id/assertions` → all assertions across the suite's child runs
      - `GET /api/runs/:runId/assertions` → assertions for one child run
      - Paths exposed through `ApiPaths.workflowTestSuiteRuns/testSuiteRun/testSuiteRunAssertions/runAssertions` so the next-host React Query layer can call them by helper instead of string literals.
    - **DI bootstrap** in `AppContainerFactory`: registers all new singletons (factories, mappers, guard, repository selector, route handler + registrar) and wires Prisma vs in-memory `TestSuiteRunRepository` / `TestAssertionRepository` based on `appConfig.persistence.kind` (mirroring the existing `WorkflowRunRepository` selection). `TestSuiteOrchestrator` itself is registered via a tsyringe factory that injects `Engine` + the engine-side `RunEventBus` + a fresh `CredentialResolverFactory(CredentialSessionService)`.
    - **DTOs** in `application/contracts/TestingContracts.ts`: `StartTestSuiteRunRequest/Response`, `TestSuiteRunSummaryDto`, `TestSuiteRunDetailDto`, `TestAssertionDto`. Mappers (`TestSuiteRunSummaryMapper`, `TestAssertionMapper`) translate persistence records → wire shape.
    - **WebSocket / event narrowing** — `WorkflowWebsocketServer` and one integration test reader updated to type-narrow on the new test-suite event kinds (which carry `testSuiteRunId` rather than `runId`).

  **Tests**
  - `TestSuiteOrchestrator` unit suite (6 tests): per-item dispatch with `testContext`, partial-pass aggregation, lifecycle event emission, concurrency cap, `errored` status when `generateItems` throws, rejection of non-test triggers.
  - Node unit suite (6 tests): TestTrigger passthrough + `triggerKind === "test"`, IsTestRun routing on both branches, AssertionNode emitting one item per result, `emitsAssertions === true`.
  - `TestRunnerService` integration suite (2 tests): creates the persistence row, finalizes counts + coverage, persists 3 `TestAssertion` rows from a 2-case suite (one passing, one failing); rejects non-test triggers without leaving a phantom row.
  - **`@codemation/next-host` — Tests tab UI**
    - **Third canvas tab** ("Tests") next to Live workflow / Executions, mutually exclusive with both. Local React state for now (Phase 1) — promotion to the URL codec is a Phase 2 cleanup once the UX is settled.
    - **`TestsPanel`** — top-level container with a trigger picker (shadcn `Select` populated from workflow nodes whose `triggerKind === "test"`), a "Run tests" CTA wired through `useStartTestSuiteRunMutation`, a left list of past suite runs, and a right detail panel.
    - **`TestSuitePassRateChart`** — recharts line chart of pass rate over time across this workflow's suite runs. Carries an explicit `rolling-input` label so authors don't read trends as agent regressions when the underlying fixtures drift (Phase 2 ships snapshots).
    - **`TestSuiteRunsList`** + **`TestSuiteRunStatusBadge`** — list rows + colored status badges (`running` / `succeeded` / `partial` / `failed` / `cancelled` / `errored`).
    - **`TestSuiteRunDetailPanel`** — header with pass-rate + counts + concurrency + nodes-covered + (when set) an `errorMessage` callout; the body is a per-run grouped assertions list.
    - **`TestAssertionsList`** + **`TestAssertionRow`** — each assertion shows status badge, optional score, optional `expected`/`actual` JSON viewers side-by-side.
    - **React Query hooks** (`testSuiteHooks.ts`) cover all four GET endpoints plus the start mutation, with cache invalidation on `workflowTestSuiteRunsQueryKey` after a successful run.
    - **WorkflowNodeDto** + **mapper additions** (host + next-host's `PersistedWorkflowSnapshotMapper`) propagate `triggerKind` to the wire shape so the Tests panel can identify test triggers without server round-trips. Both mappers default omitted values to `"live"` to keep the wire DTO consistent.

  **Not in this slice (planned follow-ups)**
  - Test-input snapshots (Phase 2 — Phase 1 inputs are always live; UI carries a "rolling-input" label so charts aren't read as agent regressions).
  - Declarative assertion family (StringEquals, JsonPath, JudgeByAgent helpers — generic callback `Assertion` covers Phase 1).
  - Cancellation endpoint (`POST /api/test-suite-runs/:id/cancel`) — orchestrator already supports `AbortSignal` cancellation; the HTTP surface for it is deferred until the UI surfaces it.
  - Realtime updates on the Tests panel — currently the suite list refetches on mutation success; live `testSuite*` events arrive via the existing realtime bridge but the Tests panel doesn't subscribe yet.
  - URL codec entry for `pane=tests` so suite drilldowns are deep-linkable (currently in-memory React state).
  - Coverage heatmap overlay on the canvas itself.

  The contract additions are **strictly additive**; no existing API surface changed shape.

### Patch Changes

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

- [#107](https://github.com/MadeRelevant/codemation/pull/107) [`3fe4213`](https://github.com/MadeRelevant/codemation/commit/3fe4213292bd0dd45af8de96d63e403dbc373b6b) Thanks [@cblokland90](https://github.com/cblokland90)! - Upgrade `HttpRequest` node + ship `defineRestNode` for plugin API-wrapper nodes.

  **`@codemation/core-nodes`**
  - `HttpRequest` args extended with `url` (literal/templated), `headers`, `query`, `body`, and `credentialSlot`. Existing workflows using only `method` + `urlField` keep working unchanged.
  - New shared HTTP engine: `HttpRequestExecutor` (single request, injected `fetch`), `HttpBodyBuilder` (JSON / form-urlencoded / multipart with binary), `HttpUrlBuilder` (query merge with arrays).
  - Four generic HTTP credential types auto-registered in every Codemation app:
    - `bearerTokenCredentialType` — `Authorization: Bearer <token>`
    - `apiKeyCredentialType` — header or query-param key injection
    - `basicAuthCredentialType` — `Authorization: Basic <base64>`
    - `oauth2ClientCredentialsType` — machine-to-machine token exchange (client_credentials grant; per-session token caching)
  - `defineRestNode(...)` — declarative helper wrapping `defineNode` for thin API-wrapper nodes: declare endpoint, credentials, input schema, request shape, and response mapper in one call. Path `{placeholder}` substitution from input. Configurable `errorPolicy` (`"throw"` | `"passthrough"`).

  **`@codemation/host`** — auto-registers the four new credential types alongside OpenAI so they appear in the credentials UI without consumer config changes.

  **`@codemation/create-codemation`** — plugin template gains an `ExampleRestNode.ts` demonstrating the `defineRestNode` pattern.

- [#100](https://github.com/MadeRelevant/codemation/pull/100) [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Workflow Testing UI polish and end-to-end correctness fixes.

  **`@codemation/next-host`** — Tests UI
  - Fix `Maximum update depth exceeded` on the Tests panel. The trends chart was receiving a
    fresh `[]` reference per render (`?? []` inline) which made recharts' internal effects loop;
    every `?? EMPTY_*` fallback the chart consumes is now a module-scoped stable reference.
  - Fix the same loop class on the canvas-play-dropdown → Tests path. The auto-start `useEffect`
    had `startMutation` (a react-query mutation result, unstable per render) in its deps array,
    which re-fired the mutation on every render. Now uses a ref keyed on `autoStartTriggerNodeId`
    with explicit reset when the prop clears.
  - Fix the canvas inspector showing `{ "json": {...} }` for historical / test-suite child runs.
    `WorkflowDetailPresenter.jsonValueToMainItems` was wrapping every array entry as
    `{ json: <entry> }`, but trigger outputs are persisted **already-Item-shaped**, producing
    `{json: {json: {...}}}`. Detects already-Item entries and passes them through.
  - Surface assertion-rollup-corrected status on the executions list. New `RunSummary.testCaseStatus`
    is preferred over engine `status` so a test-case run whose assertions failed shows as
    **failed** instead of "completed" (engine status is unchanged — only the UI display).
  - Tabs no longer overlap the test-cases detail panel — moved from absolute positioning to a flow
    header in the Tests view.
  - Filter strip above the case tree-table: All / Passing / Failing / Errored / In flight, with
    live counts. Empty buckets are disabled so users can't filter into a confusing empty state.
  - Collapse all / Expand all controls on the case tree-table; expansion state lifted from
    per-row `useState` to the table so broadcasts work. Auto-open-on-failure heuristic still fires
    per-row but only the first time each run id appears, so a row the user explicitly collapsed
    stays collapsed when realtime updates stream in.
  - Trend chart x-axis is now numeric `idx` with subsampled ticks (~5 evenly-spaced labels) and
    time-aware formatting (`HH:MM` when all runs share a day, `M/D HH:MM` across days).
  - Status icon expanded to cover the full case-status union (`succeeded` / `failed` / `errored` /
    `cancelled` / `running` / `queued`) with distinct icons and colors.

  **`@codemation/host`** — Testing framework correctness
  - Fix `TestSuiteRunTracker` race that left the last test case stuck on `testCaseStatus="running"`
    and the suite counters off by one. The bus dispatched events fire-and-forget; `finalize` ran
    before in-flight handlers wrote their `updateTestCaseStatus` calls. Tracker now serializes
    events through a `processingTail` chain and `finalize` awaits it before reading
    `listChildRuns`.
  - Initialize `Run.testCaseStatus` to `"running"` at row creation when `executionOptions.testContext`
    is present. Previously the tracker's `persistCaseStarted` raced the engine inserting the row
    and silently swallowed P2025 — the suite-detail page never showed a "running" transition.
  - `TestSuiteChildRunDto` exposes the new `testCaseStatus?: TestCaseRunStatus` field; mapper
    narrows the persistence string through a known-statuses guard.
  - `PrismaWorkflowRunRepository.listRuns` threads `testCaseStatus` into `RunSummary` so the
    executions list can render the corrected outcome.

  **`@codemation/core`**
  - `RunSummary` gains an optional `testCaseStatus?: TestCaseRunStatus`. Additive, non-breaking.

  **Dev experience**
  - `pnpm dev` (root) now runs `tsdown --watch` for `@codemation/host` alongside `test-dev` under
    `concurrently`, so host source edits rebuild `dist/` automatically. Without this, host changes
    were invisible to the running Next dev server (which deliberately resolves host from `dist/`
    to keep Turbopack memory bounded on 8 GB WSL boxes), forcing a manual
    `pnpm --filter @codemation/host build` after every host edit.

  **Documentation**
  - Top-level `docs/workflow-testing.md` and the `codemation-workflow-dsl` skill reference
    rewritten for the score-based assertion model (`score: 0..1` + `passThreshold?` + `errored?`),
    with examples for boolean assertions, continuous metrics, and judge-by-agent assertions.

  **Tests**
  - New HTTP-driven e2e suite (`packages/host/test/e2e/testSuiteRunHttpFlow.e2e.test.ts`) drives
    the full real-orchestrator + real-Prisma + real-engine lifecycle through `POST` →
    `GET /api/test-suite-runs/:id` → child runs → assertions, asserting the partial-suite
    outcome with assertion-rollup downgrade.
  - New unit tests cover the case-status filter engine, the historical-run double-wrap regression,
    and the chart prop-stability regression class.

- Updated dependencies [[`4902978`](https://github.com/MadeRelevant/codemation/commit/49029782243ece59ab6aa5bb46396db445cad47c), [`6566d55`](https://github.com/MadeRelevant/codemation/commit/6566d55c829f6631357ac95052b0852e86092ac5), [`d63cd6c`](https://github.com/MadeRelevant/codemation/commit/d63cd6c6954ada09fa81cf15e23fbc157b5387a8), [`a77505f`](https://github.com/MadeRelevant/codemation/commit/a77505f331d7d3892f3c1c8f19dc37952b4d96bd), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`fb9f7fe`](https://github.com/MadeRelevant/codemation/commit/fb9f7fed9bf5a3d6b0c5f78a30027be3ab7bcaca), [`2c0723f`](https://github.com/MadeRelevant/codemation/commit/2c0723fb1670e842c272939b5db73d4b95b25535), [`6fc7d3f`](https://github.com/MadeRelevant/codemation/commit/6fc7d3fe95f8d88386c16971fffa8dd3faa7704f), [`781c146`](https://github.com/MadeRelevant/codemation/commit/781c146eb9d8bb8bdbc1963ea2a4b9abe4b7bfbf), [`3ddde81`](https://github.com/MadeRelevant/codemation/commit/3ddde810e3ff4e16edad50af22e90c820a21e4af), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb), [`3fe4213`](https://github.com/MadeRelevant/codemation/commit/3fe4213292bd0dd45af8de96d63e403dbc373b6b), [`11616ae`](https://github.com/MadeRelevant/codemation/commit/11616aefb91d4b96b7eb9af4b935eec055a8a7bb)]:
  - @codemation/core@2.0.0
  - @codemation/core-nodes@1.1.0
  - @codemation/eventbus-redis@0.0.34

## 1.0.2

### Patch Changes

- [`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce) - Establish "per Item per Call" identity end-to-end so the workflow run inspector reports, visualizes, and dashboards multi-item AI agents correctly.

  Previously, an orchestrator agent that processed N items emitted one flat list of LLM rounds and tool calls — the bottom execution tree, the right-panel agent timeline, cost dashboards, and the realtime event stream all collapsed iterations into one bucket, making sub-agent fan-outs (and parallel item processing in general) unreadable.

  **What changed**
  - **Engine** (`@codemation/core`): `NodeExecutor` mints a `NodeIterationId` per item inside per-item runnable activations and stamps it (with `itemIndex`) onto `NodeExecutionContext`. Connection invocations, telemetry spans (`gen_ai.chat.completion`, `agent.tool.call`), metric points (`codemation.cost.estimated`, `codemation.agent.turns`, `codemation.agent.tool_calls`), and run events all carry the per-item identity. New `ChildExecutionScopeFactory` re-roots `NodeExecutionContext` for sub-agents so credentials and iteration ids resolve correctly across the orchestrator → tool → sub-agent boundary.
  - **Sub-agent credentials** (`@codemation/core-nodes`): `NodeBackedToolRuntime.resolveNodeCtx` no longer re-wraps `args.ctx.nodeId` with `ConnectionNodeIdFactory.toolConnectionNodeId` — the caller already pre-wraps it. The previous double-nesting produced exponentially deep node ids (`AIAgentNode:2__conn__tool__conn__searchInMail__conn__tool__conn__searchInMail__conn__llm`) that didn't match user-bound credential slots. Sub-agent OpenAI / API-key slots resolve again.
  - **Realtime events**: new `connectionInvocationStarted` / `connectionInvocationCompleted` / `connectionInvocationFailed` events carry the full `ConnectionInvocationRecord` (incl. `iterationId`, `itemIndex`, `parentInvocationId`) and surgical reducers update the run cache without waiting for a coarse `runSaved` snapshot. Run-query polling dropped from 250 ms → 5 s now that WebSocket events drive most updates.
  - **Persistence** (`@codemation/host`): Prisma `ExecutionInstance` model gains `iteration_id`, `item_index`, `parent_invocation_id` columns + index (sqlite + postgres migrations); `PrismaWorkflowRunRepository` round-trips them on read/save and via `ExecutionInstanceDto`. Without this the cold reload of a finished run silently flattens the per-item tree because `runSaved` events stream through Prisma. Telemetry tables already carried these columns from Phase 4; both sides now agree.
  - **Iteration projection / cost queries** (`@codemation/host`): new `RunIterationProjectionFactory` projects `RunIterationRecord`s from connection invocations + iteration cost metrics and `GetIterationCostQueryHandler` serves per-iteration cost rollups for dashboards.
  - **Inspector view model** (`@codemation/next-host`): `NodeInspectorTelemetryPresenter` groups LLM and tool spans by `iterationId` into "Item N" accordion entries (single-item agents fall back to flat layout). New `FocusedInvocationModelFactory` powers item-level prev/next navigation when a specific invocation is selected — the breadcrumb shows "Item X of Y" and nav targets the first invocation of adjacent items. Tool spans now interleave chronologically with LLM rounds (request → tools → response) instead of LLM rounds first then orphan tools at the bottom.
  - **Bottom execution tree** (`@codemation/next-host`): new `ExecutionTreeItemGroupInjector` injects synthetic "Item N" parent rows between an agent and its connection invocations when the agent processed 2+ items. Single-item activations are left untouched; sub-agent invocations whose `parentInvocationId` already points at a tool-call row stay nested under the orchestrator's specific tool call.
  - **Sub-agent credential boundary**: `ChildExecutionScopeFactory.forSubAgent` ensures sub-agent `NodeExecutionContext` keeps the parent invocation id and span context intact so trace nesting and credential resolution agree on the connection-node id.
  - **Tests**: new unit + UI suites for each layer (sub-agent scope, item-group injector, focused invocation model, agent timeline per-item grouping, chronological ordering, Prisma iterationId round trip, item-aware properties panel, connection-invocation event publisher) and a runnable `apps/test-dev` sample (`agentSubAgentToolFanout`) that exercises the orchestrator → sub-agent fan-out across 2 items end-to-end.

- Updated dependencies [[`ed75183`](https://github.com/MadeRelevant/codemation/commit/ed75183f51ae71b06aa2e57ae4fc48ce9db2e4ce)]:
  - @codemation/core@1.0.1
  - @codemation/core-nodes@1.0.2
  - @codemation/eventbus-redis@0.0.33

## 1.0.1

### Patch Changes

- Updated dependencies [[`328c975`](https://github.com/MadeRelevant/codemation/commit/328c9759d45b711c177ea9a360ed4960ffdf5ffa)]:
  - @codemation/core-nodes@1.0.1

## 1.0.0

### Major Changes

- [#93](https://github.com/MadeRelevant/codemation/pull/93) [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace LangChain with the Vercel AI SDK for all AIAgent flows.

  Codemation no longer depends on `@langchain/core` or `@langchain/openai`. Chat model providers, the turn loop, structured output, and tool calls now run on top of the Vercel **AI SDK** (`ai`, `@ai-sdk/openai`, `@ai-sdk/provider`). Custom Codemation behaviors that LangChain did not cover — the **tool-args repair loop**, the **structured-output repair loop**, **connection-invocation tracking**, and our **telemetry / cost-tracking spans** — are preserved and built on top of the new primitives.

  ### Dependency changes
  - **Removed**: `@langchain/core`, `@langchain/openai` (from `@codemation/core-nodes`).
  - **Added**: `ai` `^6.0.168`, `@ai-sdk/openai` `^3.0.53`, `@ai-sdk/provider` `^3.0.8` (to `@codemation/core-nodes`). `@codemation/host` picks up `ai` + `@ai-sdk/provider` for its test harness only.

  ### Public API renames (`@codemation/core`)

  | Before                                               | After                                                                                                             |
  | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
  | `LangChainChatModelLike`                             | `ChatLanguageModel`                                                                                               |
  | `LangChainStructuredOutputModelLike`                 | _(removed — replaced by `StructuredOutputOptions` + `generateText({ experimental_output: Output.object(...) })`)_ |
  | `ChatModelFactory.create` → `LangChainChatModelLike` | `ChatModelFactory.create` → `ChatLanguageModel` (thin wrapper around an AI SDK `LanguageModelV2`)                 |

  `ChatLanguageModel` exposes the underlying AI SDK `LanguageModel` via `languageModel` plus `modelName`, `provider`, and optional `defaultCallOptions` (`maxOutputTokens`, `temperature`, `providerOptions`). `StructuredOutputOptions` mirrors `generateText({ output: Output.object(...) })` and carries an optional `schemaName` plus `strict` flag.

  ### Custom behavior preserved (not delegated to the AI SDK)
  - **Tool dispatch + tool-args repair**: tools are passed to `generateText` **without `execute`** so tool calls surface back to Codemation; `AgentToolExecutionCoordinator` still drives parallel execution, per-tool Zod-input validation, repair prompts, and retry accounting via `repairAttemptsByToolName`.
  - **Structured output repair**: `AgentStructuredOutputRunner` still runs the `OpenAiStrictJsonSchemaFactory` + `AgentStructuredOutputRepairPromptFactory` loop; AI SDK's `Output.object(...)` is used only for the **first** structured attempt when the provider supports it.
  - **Connection-invocation tracking**: `ConnectionInvocationIdFactory` + synthetic `LanguageModelConnectionNode` / tool connection node states (`queued` / `running` / `completed` / `failed`) are still emitted per turn and per tool call.
  - **Telemetry span names (intentional, short-term)**: LLM calls stay on `gen_ai.chat.completion`, tool calls on `agent.tool.call`, metrics on `codemation.ai.turns` / `codemation.ai.tool_calls` / `codemation.cost.estimated`. We disable AI SDK's built-in telemetry (`experimental_telemetry`) for this cut so host-side telemetry aggregations keep working unchanged. Migrating to AI SDK native span names is intentionally deferred.
  - **Engine-level retry control**: every `generateText` call uses `maxRetries: 0` so Codemation's own retry / repair policy is the single source of truth.

  ### New test utilities

  Tests that previously scripted `LangChainChatModelLike` now script AI SDK `LanguageModelV3` via `MockLanguageModelV3` from `ai/test`. `@codemation/core-nodes` and `@codemation/host` test files ship small adapters (`ScriptedResponseConverter`, `ScriptedDoGenerateFactory`, `TelemetryResponseConverter`) that translate Codemation's legacy `{ content, tool_calls, usage_metadata }` fixtures into `LanguageModelV3GenerateResult`.

  ### Migration notes for consumers
  - If you implemented a **custom `ChatModelFactory`**, return a `ChatLanguageModel` (wrap an AI SDK `LanguageModelV2`) instead of a LangChain-shaped chat model. The `name` / `modelName` / `provider` on your config still drive cost tracking.
  - If you imported the type `LangChainChatModelLike` (or `LangChainStructuredOutputModelLike`) from `@codemation/core`, switch to `ChatLanguageModel` (and drop structured-output-method imports — `generateText({ experimental_output })` covers it).
  - `OpenAIChatModelFactory` now builds an AI SDK OpenAI provider under the hood; behavior for end users (model presets, credential resolution, token accounting, structured output against strict mode) is unchanged.
  - Telemetry dashboards, trace views, and cost-tracking queries continue to work against the existing Codemation span / metric names.

### Patch Changes

- [#93](https://github.com/MadeRelevant/codemation/pull/93) [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix `Unique constraint failed on the fields: (instance_id)` crash when rerunning a workflow that contains an AI agent.

  Reproduction: build `Manual trigger → AI agent → node → node`, click play on the agent, then click play on the next node (sometimes twice). The second run would fail at `PrismaWorkflowRunRepository.saveOnce` with a Postgres PK violation on the `ExecutionInstance` table.

  Root cause: `RunStartService.createRunCurrentState` was deep-copying the prior run's `connectionInvocations` verbatim into the new run's initial state. Each record kept its original globally-unique `invocationId`, which is the primary key in `ExecutionInstance`. `saveOnce`'s existing-row lookup is scoped to the current `runId`, so the collision against the prior run's rows was only detected by Postgres when the insert fired.

  Beyond the crash, the old behavior was also a data-model lie for compliance / OTEL: a `ConnectionInvocationRecord` represents a single auditable LLM / tool call and must belong to exactly one run. Copying it into another run made the same event appear to have happened twice.

  Fix (domain + defense-in-depth):
  - `@codemation/core` — `RunStartService.createRunCurrentState` now starts new runs with an empty invocation ledger. The prior run's invocations remain queryable on that run's persisted state (their true owner).
  - `@codemation/host` — `PrismaWorkflowRunRepository.buildExecutionInstances` skips any invocation whose `runId` differs from the run being saved, so a stray carry-over from any other code path self-heals instead of crashing the save.

  UI impact: none for the historical-run view (it reads invocations directly from the selected run). The client-side debugger overlay continues to surface the prior run's invocations locally during a rerun, and inspector telemetry already fetches against each invocation's original `runId`.

- Updated dependencies [[`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c), [`640e303`](https://github.com/MadeRelevant/codemation/commit/640e3032b1386568df725980a27761b6e230302c)]:
  - @codemation/core-nodes@1.0.0
  - @codemation/core@1.0.0
  - @codemation/eventbus-redis@0.0.32

## 0.3.1

### Patch Changes

- [`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3) Thanks [@cblokland90](https://github.com/cblokland90)! - Default DI container registrations to singletons so framework services that own long-lived resources (timers, subscriptions, sockets) have deterministic lifecycles. Previously `container.register(Class, { useClass: Class })` produced a new instance per resolution, which caused the `WorkflowRunRetentionPruneScheduler` `setInterval` timer to leak across HMR reloads and blocked `pnpm dev` from shutting down on Ctrl+C.

  Public registration DTOs still accept `useClass` as a shape hint, but the host applies every class-based registration as a singleton. Plugin authors using `plugin.register({ registerNode, registerClass })` and consumers using `containerRegistrations: [{ token, useClass }]` no longer need to reason about lifecycle. Redundant `@registry([{ useClass }])` decorators on Hono route registrars and domain event handlers have been removed.

  A new ESLint rule (`codemation/no-transient-container-register`) prevents reintroducing `.register(token, { useClass: Class })` and `@registry([{ useClass: Class }])` patterns across `packages/**` and `apps/**`.

- Updated dependencies [[`7eaa288`](https://github.com/MadeRelevant/codemation/commit/7eaa288737f2d126218dac84fa4fde2a4113b7f3)]:
  - @codemation/core@0.8.1
  - @codemation/core-nodes@0.4.3
  - @codemation/eventbus-redis@0.0.31

## 0.3.0

### Minor Changes

- [#85](https://github.com/MadeRelevant/codemation/pull/85) [`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868) Thanks [@cblokland90](https://github.com/cblokland90)! - Decouple telemetry retention from run deletion and move node-specific measurements onto metric points.
  - allow telemetry spans, artifacts, and metrics to outlive raw run state through explicit retention timestamps
  - narrow telemetry spans to canonical span fields and persist extensible node-specific measurements as metric points
  - update telemetry queries, docs, and regression coverage around real workflow execution plus agent/tool observability

- [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79) Thanks [@cblokland90](https://github.com/cblokland90)! - Add catalog-backed cost tracking contracts and wire AI/OCR usage into telemetry so hosts can aggregate provider-native execution costs.

  Improve the telemetry dashboard and workflow detail experience with cost breakdowns, richer inspector data, workflow run cost totals, and credential rebinding fixes.

- [#87](https://github.com/MadeRelevant/codemation/pull/87) [`4c50f29`](https://github.com/MadeRelevant/codemation/commit/4c50f29763ad7bc1e39723a6711ca3cf9add5014) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry dashboard API and replace the placeholder dashboard with filterable workflow and AI metrics.
  - expose summary, timeseries, and model-dimension telemetry queries for dashboard clients
  - add a next-host dashboard with time, workflow, folder, status, and model filters plus run/token charts

- [`5d649ee`](https://github.com/MadeRelevant/codemation/commit/5d649ee878f417ad18159584941af6de0a55c0a7) - Expand the telemetry dashboard so operators can filter, persist, and inspect workflow runs more effectively.
  - add run-origin filters, paginated run results, and richer telemetry query support on the host API
  - redesign the next-host dashboard with grouped metrics, sticky filters, nested workflow selection, persisted filters, and clearer multi-select controls

### Patch Changes

- [#88](https://github.com/MadeRelevant/codemation/pull/88) [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a telemetry-backed node inspector slice for workflow detail and expose run-trace telemetry needed to power it.

- Updated dependencies [[`a250ab8`](https://github.com/MadeRelevant/codemation/commit/a250ab8b973429cdfe708526a205e2565b004868), [`782e934`](https://github.com/MadeRelevant/codemation/commit/782e93469ea6eee701d976b8f1dc18649d045c79), [`052aba1`](https://github.com/MadeRelevant/codemation/commit/052aba17c9a4faf557bdfaa1a9644a1987ecc25e), [`1a356af`](https://github.com/MadeRelevant/codemation/commit/1a356afae50bd3f982e92c3e9f931e3adbcd131f)]:
  - @codemation/core@0.8.0
  - @codemation/core-nodes@0.4.2
  - @codemation/eventbus-redis@0.0.30

## 0.2.5

### Patch Changes

- Updated dependencies [[`1c74067`](https://github.com/MadeRelevant/codemation/commit/1c74067a474b54a8d6c73f55db4c3d8d3e20e2ae)]:
  - @codemation/core-nodes@0.4.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4), [`88844f7`](https://github.com/MadeRelevant/codemation/commit/88844f75a48fe051e4cb895c710408855de14da4)]:
  - @codemation/core-nodes@0.4.0
  - @codemation/core@0.7.0
  - @codemation/eventbus-redis@0.0.29

## 0.2.3

### Patch Changes

- Updated dependencies [[`f451b1b`](https://github.com/MadeRelevant/codemation/commit/f451b1b4657b59406e15ce5f50b243e487ff99ed)]:
  - @codemation/core-nodes@0.3.0

## 0.2.2

### Patch Changes

- [#73](https://github.com/MadeRelevant/codemation/pull/73) [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348) Thanks [@cblokland90](https://github.com/cblokland90)! - Improve credential UX and add extensible advanced field presentation.
  - Run automatic credential health tests after create/save (including OAuth) and keep the dialog open when the test fails; auto-bind newly created credentials to empty workflow slots; auto-bind when picking an existing credential from the workflow slot dropdown while the slot is unbound.
  - Add `CredentialFieldSchema.visibility` (`default` | `advanced`) and optional `CredentialTypeDefinition.advancedSection` (advanced fields always render in a collapsible block; section labels default when omitted). Next host uses stable test ids and fixes collapsible chevron styling.
  - Credential dialog: title uses the credential type name (e.g. **Add …** / type display name on edit); hide the redundant type dropdown in edit mode.
  - Gmail OAuth: group Client ID with Client secret, move scope preset and custom scopes under an **OAuth scopes** advanced section (collapsed by default).
  - Documentation: `packages/core/docs/credential-ui-fields.md`, AGENTS.md, and credential development skill reference.

- Updated dependencies [[`3044e73`](https://github.com/MadeRelevant/codemation/commit/3044e73fd3cfb33f8e2cbc579c10baf97ed94658), [`418434a`](https://github.com/MadeRelevant/codemation/commit/418434a6a2ad88a6254a94cb70e6f14b886df348), [`3774fd8`](https://github.com/MadeRelevant/codemation/commit/3774fd80bc357c7eb39957f6963c692f322c38eb), [`00bc135`](https://github.com/MadeRelevant/codemation/commit/00bc1351e2dd6222d5101dbff3602a76ead33ce1), [`26ebe63`](https://github.com/MadeRelevant/codemation/commit/26ebe6346db0e9133a2133435a463c3dcd2dc537)]:
  - @codemation/core@0.6.0
  - @codemation/core-nodes@0.2.0
  - @codemation/eventbus-redis@0.0.28

## 0.2.1

### Patch Changes

- [#64](https://github.com/MadeRelevant/codemation/pull/64) [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

  Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.

## 0.2.0

### Minor Changes

- [#60](https://github.com/MadeRelevant/codemation/pull/60) [`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c) Thanks [@cblokland90](https://github.com/cblokland90)! - Harden the Gmail plugin so it imports reliably from the package root, returns an authenticated official Gmail session, and supports trigger/read/send/reply/label workflows with one OAuth credential.

  Add framework support for OAuth scope presets and custom per-credential scope replacement, and update the plugin starter/docs so future plugins scaffold the same publishable root-entrypoint conventions.

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0
  - @codemation/core-nodes@0.1.1
  - @codemation/eventbus-redis@0.0.27

## 0.1.7

### Patch Changes

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0
  - @codemation/core-nodes@0.1.0
  - @codemation/eventbus-redis@0.0.26

## 0.1.6

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0
  - @codemation/core-nodes@0.0.25
  - @codemation/eventbus-redis@0.0.25

## 0.1.5

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3
  - @codemation/core-nodes@0.0.24
  - @codemation/eventbus-redis@0.0.24

## 0.1.4

### Patch Changes

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2
  - @codemation/core-nodes@0.0.23
  - @codemation/eventbus-redis@0.0.23

## 0.1.3

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1
  - @codemation/core-nodes@0.0.22
  - @codemation/eventbus-redis@0.0.22

## 0.1.2

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Integration tests: provision one shared Postgres in Vitest global setup when `DATABASE_URL` is unset (avoids per-suite Testcontainers flakes), with a cross-process lock when host and CLI integration projects run global setup together.

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/core@0.2.0
  - @codemation/core-nodes@0.0.21
  - @codemation/eventbus-redis@0.0.21

## 0.1.1

### Patch Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Integration tests: provision one shared Postgres in Vitest global setup when `DATABASE_URL` is unset (avoids per-suite Testcontainers flakes), with a cross-process lock when host and CLI integration projects run global setup together.

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/core@0.1.0
  - @codemation/core-nodes@0.0.20
  - @codemation/eventbus-redis@0.0.20

## 0.1.0

### Minor Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Align dev auth with the runtime API: proxy `/api/auth/*` through `CODEMATION_RUNTIME_DEV_URL` so SQLite has a single DB owner, tighten middleware path rules to avoid redundant session checks, and document root `pnpm dev` framework-author flow.

## 0.0.19

### Patch Changes

- [#26](https://github.com/MadeRelevant/codemation/pull/26) [`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual trigger reruns and current-state resume behavior.

  Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19
  - @codemation/core-nodes@0.0.19
  - @codemation/eventbus-redis@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
  - @codemation/core-nodes@0.0.18
  - @codemation/eventbus-redis@0.0.18
