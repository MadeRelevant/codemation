---
"@codemation/core": patch
"@codemation/host": patch
---

feat(host,core): ControlPlaneCredentialMaterialProvider + managed-mode DI wiring

Credentials vault story 02. In managed mode the workspace now fetches access
tokens from the control plane at use time over HMAC instead of holding OAuth
material locally. Refresh tokens never leave the control plane.

- `@codemation/core`: new `ManagedCredentialMaterialWriteError` and
  `ManagedMaterialFetchError` (carries HTTP status + CP error body) so call
  sites can `instanceof`-check.
- `@codemation/host`: `ControlPlaneCredentialMaterialProvider` POSTs
  `<CP>/internal/credentials/material/:ref` with `{ callerContext }`,
  HMAC-signed via the existing `PairedFetch`. `setMaterial` always throws
  `ManagedCredentialMaterialWriteError`.
- `CompositeCredentialMaterialProvider` dispatches `getMaterial` /
  `setMaterial` to the right inner provider based on `ref.source`, so
  workspaces with mixed local + control-plane credential rows read each
  through the correct provider.
- New `ApplicationTokens.CredentialMaterialInnerProvider` token; the
  in-memory cache (`CachingCredentialMaterialProvider`) now injects the
  token instead of the local provider class. In standalone mode the token
  resolves to `LocalCredentialMaterialProvider`; in managed mode (paired
  with a control plane) it resolves to `CompositeCredentialMaterialProvider`.

Call sites (the existing credential resolver path) are not yet routed
through the provider; that wiring lands with the resolver refactor in a
follow-up story. Caller context plumbing from real call sites is also
out of scope for this story (per the story's Decisions section).
