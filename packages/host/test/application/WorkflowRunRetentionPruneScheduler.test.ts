import { describe, expect, it } from "vitest";

import type { BinaryStorage, Clock, RunId, RunPruneCandidate } from "@codemation/core";

import { WorkflowRunRetentionPruneScheduler } from "../../src/application/runs/WorkflowRunRetentionPruneScheduler";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { WorkflowRunRepository } from "../../src/domain/runs/WorkflowRunRepository";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

class TestLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class TestLoggerFactory implements LoggerFactory {
  create(): Logger {
    return new TestLogger();
  }
}

describe("WorkflowRunRetentionPruneScheduler", () => {
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
    const candidates: ReadonlyArray<RunPruneCandidate> = [
      {
        runId: "run-1",
        workflowId: "wf-1",
        startedAt: "2026-04-06T10:00:00.000Z",
        finishedAt: "2026-04-06T10:10:00.000Z",
      },
    ];
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
      appConfig,
      new TestLoggerFactory() as never,
    );

    await scheduler.runOnce();

    expect(deletedBinaryKeys).toEqual(["storage-key-1", "storage-key-2"]);
    expect(deletedRuns).toEqual(["run-1"]);
    expect(loadedRuns).toEqual([]);
  });
});
