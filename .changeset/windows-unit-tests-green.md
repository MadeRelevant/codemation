---
"@codemation/host": patch
"@codemation/canvas-core": patch
"@codemation/next-host": patch
---

Make the unit-test suite pass on Windows.

- `PrismaMigrationDeployer`: read `CODEMATION_PRISMA_CLI_PATH`, `CODEMATION_PRISMA_CONFIG_PATH`, `CODEMATION_HOST_PACKAGE_ROOT` from the `env` argument passed to `deploy(...)`/`deployPersistence(...)` instead of `process.env` at call time. Tests can now pass their CLI path through the deployer's existing `env` parameter rather than mutating shared `process.env`, removing the cross-file env-race that flaked SQLite deployer tests under thread-pool parallelism.
- `NodeInspectorTelemetryPresenter` + `DashboardCostAmountFormatter`: pin currency formatting to `en-US` with `currencyDisplay: "narrowSymbol"` so Node ICU versions produce `"$0.000039"` rather than `"US$0.000039"`.
- `DashboardAiUsageSummaryCard`: pin token-count formatting to `en-US` so the dashboard renders `"1,840"` regardless of system locale.

Companion test changes (not user-visible): test fixtures pass the test-only env via the deployer's `env` argument, several CLI tests wrap expected paths in `path.resolve(...)` so Windows backslash output matches, `PrismaMigrationDeployer` recovery test moved to its own file (libsql native state from earlier tests in the same file leaked into the recovery flow on Windows), and `vitest.unit.config.ts` switched to the forks pool for libsql native-module isolation across files.
