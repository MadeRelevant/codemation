---
"@codemation/canvas": patch
"@codemation/canvas-core": patch
"@codemation/next-host": patch
---

test(ui): UI security tests + test-suite orchestration (Sprint 13 Story G)

- Fix `tooling/vitest/ui.config.ts` to include `next-host`, `canvas`, and `canvas-core` UI test suites — previously only `host` was wired.
- Add `packages/canvas/test/bundleBoundary.test.ts` and `packages/canvas-core/test/bundleBoundary.test.ts`: static import-graph walk asserting no server-only imports leak into browser bundles.
- Add `packages/next-host/test/features/users/UsersInviteDialog.test.tsx`: RHF + Zod email validation (valid submit, invalid email, empty email, server error).
- Add `packages/next-host/test/features/invite/InviteAcceptScreen.test.tsx`: verify-state gate, password mismatch, password length, and successful activation.
- Add `packages/canvas/test/screens/WorkflowDetailScreen.renderWorkflowJsonEditor.test.tsx`: slot override contract (no override / with override / updated context).
- Add `packages/canvas/test/screens/WorkflowDetailScreen.fullMount.smoke.test.tsx`: full-mount smoke confirming slot wiring in the real component.
- Add `packages/next-host/vitest.ui.config.ts`: jsdom-only config scoped to `*.test.tsx` for the UI suite.
