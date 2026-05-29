---
"@codemation/canvas-core": minor
"@codemation/host": minor
"@codemation/next-host": patch
---

feat(credentials): app gallery API (framework half)

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
