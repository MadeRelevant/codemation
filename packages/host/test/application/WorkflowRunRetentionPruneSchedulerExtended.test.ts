/**
 * Additional coverage for WorkflowRunRetentionPruneScheduler:
 * - both-disabled early return (start)
 * - fallback to listRuns when listRunsOlderThan not present
 * - fallback to loadStorageKeysFromRunStateFallback when listBinaryStorageKeys not present
 * - collectStorageKeysFromValue (nested / deduplication / array / bool / primitive)
 * - artifact storage key deletion
 */
import { describe, expect, it } from "vitest";
import type { BinaryStorage, Clock, RunId } from "@codemation/core";
import { WorkflowRunRetentionPruneScheduler } from "../../src/application/runs/WorkflowRunRetentionPruneScheduler";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { WorkflowRunRepository } from "../../src/domain/runs/WorkflowRunRepository";
import type {
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanStore,
} from "../../src/domain/telemetry/TelemetryContracts";
import type { AppConfig } from "../../src/presentation/config/AppConfig";
import type { PersistedRunState } from "@codemation/core";

class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}
class SilentLoggerFactory implements LoggerFactory {
  create(): Logger {
    return new SilentLogger();
  }
}

const clock: Clock = { now: () => new Date("2026-04-07T12:00:00.000Z") };

const noopBinaryStorage: BinaryStorage = {
  driverName: "test",
  write: async () => {
    throw new Error("not used");
  },
  openReadStream: async () => {
    throw new Error("not used");
  },
  stat: async () => ({ exists: false }),
  delete: async () => undefined,
  deleteMany: async () => undefined,
  listByPrefix: async () => [],
};

const noopSpanStore: TelemetrySpanStore = {
  upsert: async () => undefined,
  list: async () => [],
  listByTraceId: async () => [],
  pruneExpired: async () => 0,
};

const noopArtifactStore: TelemetryArtifactStore = {
  save: async () => {
    throw new Error("not used");
  },
  listByTraceId: async () => [],
  pruneExpired: async () => ({ count: 0, storageKeys: [] }),
};

const noopMetricStore: TelemetryMetricPointStore = {
  save: async () => {
    throw new Error("not used");
  },
  list: async () => [],
  pruneExpired: async () => 0,
};

function makeScheduler(
  repo: WorkflowRunRepository,
  appConfig: Partial<AppConfig["env"]> = {},
  binaryStorage = noopBinaryStorage,
  artifactStore = noopArtifactStore,
): WorkflowRunRetentionPruneScheduler {
  return new WorkflowRunRetentionPruneScheduler(
    clock,
    repo,
    binaryStorage,
    noopSpanStore,
    artifactStore,
    noopMetricStore,
    { env: appConfig } as unknown as AppConfig,
    new SilentLoggerFactory() as never,
  );
}

describe("WorkflowRunRetentionPruneScheduler - branch coverage", () => {
  it("start returns early when both run-prune and telemetry-prune are disabled", () => {
    let tickCalled = false;
    const repo: WorkflowRunRepository = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async () => {
        tickCalled = true;
        return [];
      },
      deleteRun: async () => undefined,
    };
    const scheduler = makeScheduler(repo, {
      CODEMATION_RUN_PRUNE_ENABLED: "false",
      CODEMATION_TELEMETRY_PRUNE_ENABLED: "false",
    });
    scheduler.start();
    // No tick was fired synchronously
    expect(tickCalled).toBe(false);
    scheduler.stop();
  });

  it("falls back to listRuns when listRunsOlderThan is not present", async () => {
    const deletedRuns: string[] = [];
    // repo with completed/failed runs, but no listRunsOlderThan
    const repo: WorkflowRunRepository = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async () => [
        { runId: "run-done", workflowId: "wf-1", status: "completed", startedAt: "2025-01-01T00:00:00.000Z" } as never,
        { runId: "run-fail", workflowId: "wf-1", status: "failed", startedAt: "2025-01-01T00:00:00.000Z" } as never,
        { runId: "run-active", workflowId: "wf-1", status: "running", startedAt: "2025-01-01T00:00:00.000Z" } as never,
      ],
      listBinaryStorageKeys: async () => [],
      deleteRun: async (runId: RunId) => {
        deletedRuns.push(runId);
      },
      // listRunsOlderThan intentionally absent
    } as never;
    const scheduler = makeScheduler(repo, {
      CODEMATION_RUN_PRUNE_ENABLED: "true",
      CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
    });
    await scheduler.runOnce();
    // Only completed/failed runs deleted; not the running one
    expect(deletedRuns).toContain("run-done");
    expect(deletedRuns).toContain("run-fail");
    expect(deletedRuns).not.toContain("run-active");
  });

  it("falls back to loadStorageKeysFromRunStateFallback when listBinaryStorageKeys is absent", async () => {
    const deletedBinaryKeys: string[] = [];
    const state = {
      runId: "run-fb",
      workflowId: "wf-1",
      status: "completed",
      outputsByNode: {
        node1: {
          main: [
            { json: {}, binary: { f: { id: "b1", storageKey: "key-fallback", mimeType: "image/png", size: 10 } } },
          ],
        },
      },
      nodeSnapshotsByNodeId: {},
      mutableState: undefined,
    } as unknown as PersistedRunState;
    const repo: WorkflowRunRepository = {
      load: async (runId: string) => (runId === "run-fb" ? state : undefined),
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [
        {
          runId: "run-fb",
          workflowId: "wf-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          finishedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
      // listBinaryStorageKeys intentionally absent
      deleteRun: async () => undefined,
    } as never;
    const storage: BinaryStorage = {
      ...noopBinaryStorage,
      delete: async (key: string) => {
        deletedBinaryKeys.push(key);
      },
    };
    const scheduler = makeScheduler(
      repo,
      {
        CODEMATION_RUN_PRUNE_ENABLED: "true",
        CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
      },
      storage,
    );
    await scheduler.runOnce();
    expect(deletedBinaryKeys).toContain("key-fallback");
  });

  it("collects storage keys from mutableState in fallback path", async () => {
    const deletedBinaryKeys: string[] = [];
    const state = {
      runId: "run-ms",
      workflowId: "wf-1",
      status: "completed",
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: {
        nodesById: {
          node1: {
            pinnedOutputsByPort: {
              main: [
                { json: {}, binary: { f: { id: "b2", storageKey: "key-mutable", mimeType: "image/png", size: 20 } } },
              ],
            },
          },
        },
      },
    } as unknown as PersistedRunState;
    const repo: WorkflowRunRepository = {
      load: async (runId: string) => (runId === "run-ms" ? state : undefined),
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [
        {
          runId: "run-ms",
          workflowId: "wf-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          finishedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
      deleteRun: async () => undefined,
    } as never;
    const storage: BinaryStorage = {
      ...noopBinaryStorage,
      delete: async (key: string) => {
        deletedBinaryKeys.push(key);
      },
    };
    const scheduler = makeScheduler(
      repo,
      {
        CODEMATION_RUN_PRUNE_ENABLED: "true",
        CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
      },
      storage,
    );
    await scheduler.runOnce();
    expect(deletedBinaryKeys).toContain("key-mutable");
  });

  it("fallback returns empty array when run state is null", async () => {
    const deletedBinaryKeys: string[] = [];
    const repo: WorkflowRunRepository = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [
        {
          runId: "run-null",
          workflowId: "wf-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          finishedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
      deleteRun: async () => undefined,
    } as never;
    const storage: BinaryStorage = {
      ...noopBinaryStorage,
      delete: async (key: string) => {
        deletedBinaryKeys.push(key);
      },
    };
    const scheduler = makeScheduler(
      repo,
      {
        CODEMATION_RUN_PRUNE_ENABLED: "true",
      },
      storage,
    );
    await scheduler.runOnce();
    expect(deletedBinaryKeys).toHaveLength(0);
  });

  it("deletes artifact storage keys from telemetry prune", async () => {
    const deletedBinaryKeys: string[] = [];
    const artifactStore: TelemetryArtifactStore = {
      save: async () => {
        throw new Error("not used");
      },
      listByTraceId: async () => [],
      pruneExpired: async () => ({ count: 2, storageKeys: ["artifact-key-1", "artifact-key-2"] }),
    };
    const storage: BinaryStorage = {
      ...noopBinaryStorage,
      delete: async (key: string) => {
        deletedBinaryKeys.push(key);
      },
    };
    const repo: WorkflowRunRepository = {
      load: async () => undefined,
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [],
      listBinaryStorageKeys: async () => [],
      deleteRun: async () => undefined,
    };
    const scheduler = makeScheduler(
      repo,
      {
        CODEMATION_TELEMETRY_PRUNE_ENABLED: "true",
        CODEMATION_RUN_PRUNE_ENABLED: "false",
      },
      storage,
      artifactStore,
    );
    await scheduler.runOnce();
    expect(deletedBinaryKeys).toContain("artifact-key-1");
    expect(deletedBinaryKeys).toContain("artifact-key-2");
  });

  it("handles fallback with nodeSnapshotsByNodeId containing binary keys", async () => {
    const deletedBinaryKeys: string[] = [];
    const state = {
      runId: "run-snap",
      workflowId: "wf-1",
      status: "completed",
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "node-1": {
          inputsByPort: {
            main: [
              {
                json: {},
                binary: { file: { id: "snap-b1", storageKey: "snap-key-1", mimeType: "image/png", size: 5 } },
              },
            ],
          },
          outputs: {},
        },
      },
      mutableState: undefined,
    } as unknown as PersistedRunState;
    const repo: WorkflowRunRepository = {
      load: async (runId: string) => (runId === "run-snap" ? state : undefined),
      save: async () => undefined,
      listRuns: async () => [],
      listRunsOlderThan: async () => [
        {
          runId: "run-snap",
          workflowId: "wf-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          finishedAt: "2025-01-01T00:01:00.000Z",
        },
      ],
      deleteRun: async () => undefined,
    } as never;
    const storage: BinaryStorage = {
      ...noopBinaryStorage,
      delete: async (key: string) => {
        deletedBinaryKeys.push(key);
      },
    };
    const scheduler = makeScheduler(
      repo,
      {
        CODEMATION_RUN_PRUNE_ENABLED: "true",
        CODEMATION_RUN_RETENTION_DEFAULT_SECONDS: "3600",
      },
      storage,
    );
    await scheduler.runOnce();
    expect(deletedBinaryKeys).toContain("snap-key-1");
  });
});
