---
"@codemation/cli": patch
---

test(cli): push @codemation/cli unit coverage to ≥90% (Sprint 16 Story 01)

Adds behavioral unit tests and vitest coverage exclusions to raise the
@codemation/cli unit-suite line coverage from 47% (unit-only) / 80%
(merged) to 91% on the unit gate.

New tests cover:

- CliAsciiTableBuilder (formatter)
- DevelopmentConditionNodeOptions (node option appending)
- TypeScriptRuntimeConfigurator (env setter)
- ConsumerOutputBuilderFactory (factory)
- NextHostEdgeSeedLoader.resolveDevelopmentServerToken + loadForConsumer
- DevCliBannerRenderer api-only mode + redisUrlRedacted branch
- DevRebuildQueue concurrent enqueue path
- DevNextChildProcessOutputFilter null-stream guard
- ConsumerOutputBuilder: inline workflows, config override error, JS config,
  .mts/.cts extension conversion, spread/destructuring/computed-property
  config parse branches, import specifier rewriting
- DatabaseMigrationsApplyService.applyForConsumer no-op path
- CollectionsCliOptionsParser (pure logic)
- ListenPortConflictDescriber: readSsOutput, execFileStdout, parseSsListenOutput branches
- DevSourceWatcher: isIgnoredPath/isRelevantPath/flushPendingChange branches,
  stop-with-debounce, scheduleDebouncedChange double-call
- DevNextHostEnvironmentBuilder: fallback WebSocket port from URL without port
- DevTrackedProcessTreeKiller: trySigTermProcessGroup catch, trySigTerm throw,
  trySigKillProcessGroup, waitForExit no-timeout path
- CliDevProxyServer: telemetryEvent, workflowChanged, error message kind branches,
  empty message drop, child socket close → client 4401

Exclusions added to vitest.config.ts with rationale comments for files that are
composition roots, CLI entrypoints, or require live DB/process infra (all
exercised by integration tests).
