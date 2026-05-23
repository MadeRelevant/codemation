---
"@codemation/host": patch
---

fix(host/http): generic 500 error envelope + ManagedMeHonoApi error boundary (Sprint 14 Story 08)

- `ServerHttpErrorResponseFactory.fromUnknown` now returns `{ error: "Internal server error" }` for unexpected errors instead of leaking `error.message` to the client (Prisma messages, stack fragments, internal state).
- `ManagedMeHonoApiRouteRegistrar.register` wraps `sessionVerifier.verify()` in try/catch; a thrown JWT verification error now returns 401 instead of propagating as an unhandled 500.
- Tests updated: `telemetryHttpRouteHandler.test.ts` reflects generic envelope; new test in `ManagedMeHonoApiRouteRegistrar.test.ts` asserts 401 on `verify()` throw; new `ServerHttpErrorResponseFactory.test.ts` asserts generic message does not contain internal details.
