# @codemation/managed-auth

## 0.1.0

### Minor Changes

- 8285ec0: Add `@codemation/managed-auth` package and `auth.kind: "managed"` support in `@codemation/host`.

  `@codemation/managed-auth` is a new publishable package containing the JWKS cache and EdDSA JWT verifier used by managed-mode workspaces. It has no dependency on `@codemation/host` or `@codemation/core` and is intentionally self-contained so the closed-source workspace-mcp can install it from the public registry.

  `@codemation/host` gains `auth.kind: "managed"` — a new auth mode where Better Auth is not mounted, the workspace verifies CP-signed JWT bearers, and a single-origin CORS allowlist is enforced via `CP_WEB_ORIGIN`. Boot-time guard ensures all required env vars are present before startup.
