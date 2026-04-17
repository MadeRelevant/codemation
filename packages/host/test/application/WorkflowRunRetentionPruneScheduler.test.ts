import { afterEach, describe, expect, it, vi } from "vitest";

import type { BinaryStorage, Clock, RunId, RunPruneCandidate } from "@codemation/core";

import { WorkflowRunRetentionPruneScheduler } from "../../src/application/runs/WorkflowRunRetentionPruneScheduler";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { WorkflowRunRepository } from "../../src/domain/runs/WorkflowRunRepository";
import type {
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanStore,
} from "../../src/domain/telemetry/TelemetryContracts";
import { InMemoryTelemetryArtifactStore } from "../../src/infrastructure/persistence/InMemoryTelemetryArtifactStore";
import { InMemoryTelemetryMetricPointStore } from "../../src/infrastructure/persistence/InMemoryTelemetryMetricPointStore";
import { InMemoryTelemetrySpanStore } from "../../src/infrastructure/persistence/InMemoryTelemetrySpanStore";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

class TestLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  info(): void {}
  warn(message: string): void {
    this.warns.push(message);
  }
  error(): void {}
  debug(): void {}
}

class TestLoggerFactory implements LoggerFactory {
  readonly logger = new TestLogger();

  create(): Logger {
    return this.logger;
  }
}

describe("WorkflowRunRetentionPruneScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prunes using normalized candidates and binary keys without loading full run state", async () => {
    const deletedBinaryKeys: string[] = [];
    const deletedRuns: string[] = [];
    const loadedRuns: string[] = [];
    const clock: Clock = {
      now: () => new Date("2026-04-07T12:00:00.000Z"),
    };
    const binaryStorage: BinaryStorage = {
      driverName: "test",
      write: async () => {
        throw new Error("not used");
      },
      openReadStream: async () => {
        throw new Error("not used");
      },
      stat: async () => ({ exists: false }),
      delete: async (storageKey: string) => {
        deletedBinaryKeys.push(storageKey);
      },
    };
    const prunedTelemetry: string[] = [];
    const candidates: ReadonlyArray<RunPruneCandidate> = [
      {
        runId: "run-1",
        workflowId: "wf-1",
        startedAt: "2026-04-06T10:00:00.000Z",
        finishedAt: "2026-04-06T10:10:00.000Z",
      },
    ];
    const spanStore: TelemetrySpanStore = {
      upsert: async () => undefined,
      list: async () => [],
      listByTraceId: async () => [],
      pruneExpired: async () => {
        prunedTelemetry.push("span");
        return 1;
      },
    };
    const artifactStore: TelemetryArtifactStore = {
      save: async () => {
        throw new Error("not used");
      },
      listByTraceId: async () => [],
      pruneExpired: async () => {
        prunedTelemetry.push("artifact");
        return 1;
      },
    };
    const metricPointStore: TelemetryMetricPointStore = {
      save: async () => {
        throw new Error("not used");
      },
      list: async () => [],
      pruneExpired: async () => {
        prunedTelemetry.push("metric");
        return 1;
      },
    };
    const repository: WorkflowRunRepository = {
      load: async (runId: string) => {
        loadedRuns.push(runId);
        return undefined;
      },
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => candidates,
      listBinaryStorageKeys: async (_runId: RunId) => ["storage-key-1", "storage-key-2"],
      deleteRun: async (runId: RunId) => {
        deletedRuns.push(runId);
      },
    };
    const appConfig = {
      env: {
        CODEMATION_RUN_PRUNE_ENABLED: "true",
        CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
      },
    } as unknown as AppConfig;
    const scheduler = new WorkflowRunRetentionPruneScheduler(
      clock,
      repository,
      binaryStorage,
      spanStore,
      artifactStore,
      metricPointStore,
      appConfig,
      new TestLoggerFactory() as never,
    );

    await scheduler.runOnce();

    expect(deletedBinaryKeys).toEqual(["storage-key-1", "storage-key-2"]);
    expect(deletedRuns).toEqual(["run-1"]);
    expect(loadedRuns).toEqual([]);
    expect(prunedTelemetry).toEqual(["span", "artifact", "metric"]);
  });

  it("keeps telemetry after run deletion until telemetry retention expires", async () => {
    const clock: Clock = {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
    };
    const otelIdentityFactory = new OtelIdentityFactory();
    const spanStore = new InMemoryTelemetrySpanStore();
    const artifactStore = new InMemoryTelemetryArtifactStore(otelIdentityFactory);
    const metricPointStore = new InMemoryTelemetryMetricPointStore(otelIdentityFactory);
    const deletedRuns: string[] = [];
    const repository: WorkflowRunRepository = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [
        {
          runId: "run-keep-telemetry",
          workflowId: "wf-1",
          startedAt: "2026-04-01T00:00:00.000Z",
          finishedAt: "2026-04-01T00:10:00.000Z",
        },
      ],
      listBinaryStorageKeys: async () => [],
      deleteRun: async (runId: RunId) => {
        deletedRuns.push(runId);
      },
    };
    await spanStore.upsert({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-keep-telemetry",
      workflowId: "wf-1",
      name: "workflow.run",
      kind: "internal",
      retentionExpiresAt: "2026-06-01T00:00:00.000Z",
    });
    await artifactStore.save({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-keep-telemetry",
      workflowId: "wf-1",
      kind: "artifact",
      contentType: "application/json",
      retentionExpiresAt: "2026-06-01T00:00:00.000Z",
    });
    await metricPointStore.save({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-keep-telemetry",
      workflowId: "wf-1",
      name: "gen_ai.usage.total_tokens",
      value: 42,
      observedAt: "2026-04-01T00:10:00.000Z",
      retentionExpiresAt: "2026-06-01T00:00:00.000Z",
    });
    const scheduler = new WorkflowRunRetentionPruneScheduler(
      clock,
      repository,
      {
        driverName: "test",
        write: async () => {
          throw new Error("not used");
        },
        openReadStream: async () => {
          throw new Error("not used");
        },
        stat: async () => ({ exists: false }),
        delete: async () => undefined,
      },
      spanStore,
      artifactStore,
      metricPointStore,
      {
        env: {
          CODEMATION_RUN_PRUNE_ENABLED: "true",
          CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
        },
      } as unknown as AppConfig,
      new TestLoggerFactory() as never,
    );

    await scheduler.runOnce();

    expect(deletedRuns).toEqual(["run-keep-telemetry"]);
    await expect(spanStore.listByTraceId("trace-1")).resolves.toHaveLength(1);
    await expect(artifactStore.listByTraceId("trace-1")).resolves.toHaveLength(1);
    await expect(metricPointStore.list({ runId: "run-keep-telemetry" })).resolves.toHaveLength(1);
  });

  it("runs once immediately on start and does not log when nothing is pruned", async () => {
    vi.useFakeTimers();
    const clock: Clock = {
      now: () => new Date("2026-04-20T00:00:00.000Z"),
    };
    const loggerFactory = new TestLoggerFactory();
    let listRunsOlderThanCalls = 0;
    const scheduler = new WorkflowRunRetentionPruneScheduler(
      clock,
      {
        load: async () => undefined,
        save: async () => undefined,
        listRuns: async () => [],
        listRunsOlderThan: async () => {
          listRunsOlderThanCalls += 1;
          return [];
        },
        listBinaryStorageKeys: async () => [],
        deleteRun: async () => undefined,
      },
      {
        driverName: "test",
        write: async () => {
          throw new Error("not used");
        },
        openReadStream: async () => {
          throw new Error("not used");
        },
        stat: async () => ({ exists: false }),
        delete: async () => undefined,
      },
      {
        upsert: async () => undefined,
        list: async () => [],
        listByTraceId: async () => [],
        pruneExpired: async () => 0,
      },
      {
        save: async () => {
          throw new Error("not used");
        },
        listByTraceId: async () => [],
        pruneExpired: async () => 0,
      },
      {
        save: async () => {
          throw new Error("not used");
        },
        list: async () => [],
        pruneExpired: async () => 0,
      },
      {
        env: {
          CODEMATION_RUN_PRUNE_ENABLED: "true",
          CODEMATION_TELEMETRY_PRUNE_ENABLED: "true",
        },
      } as unknown as AppConfig,
      loggerFactory as never,
    );

    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(listRunsOlderThanCalls).toBe(1);
    expect(loggerFactory.logger.infos).toEqual([]);
    expect(loggerFactory.logger.warns).toEqual([]);
    scheduler.stop();
  });
});
