---
"@codemation/core-nodes": patch
"@codemation/core-nodes-gmail": patch
"@codemation/host": patch
"@codemation/canvas-core": patch
"@codemation/cli": patch
---

Coverage Phase 2: testkits (LoggerTestKit, McpTestKit, CoreNodesTestContextFactory,
TelemetryTestKit, GmailTestKit, AppConfigFixturesFactory, HookTestkit), per-package
vitest coverage thresholds, and new tests on previously zero-coverage critical paths
(mergeNode, switchNode, waitNode, connectionCredentialNode, canvas-lib pure, hook smoke).
No production code changes.
