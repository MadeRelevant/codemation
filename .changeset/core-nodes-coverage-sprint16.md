---
"@codemation/core-nodes": patch
---

test(core-nodes): push coverage to ≥90% (Sprint 16 Story 01 — core-nodes work unit)

Add `all:true` + documented exclusions to vitest coverage config so uncovered files cannot
silently inflate the percentage. Add behavioral tests for previously uncovered paths:
`ManagedModelFetcher` (no env / fetch-ok / non-ok / throws), `ApiKeyCredentialType` empty-key
throw and test() failing branch, `HttpRequest.id` getter, and `getCredentialRequirements`
object-form with and without caller-supplied `acceptedTypes`.

Lines coverage: 92.7% (up from 91.6% per-package, 90.5% merged-lcov baseline).
