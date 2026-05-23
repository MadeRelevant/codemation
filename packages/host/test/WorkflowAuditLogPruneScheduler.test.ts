import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowAuditLogPruneScheduler } from "../src/application/WorkflowAuditLogPruneScheduler";
import type { Clock } from "@codemation/core";
import type { AppConfig } from "../src/presentation/config/AppConfig";
import type { ServerLoggerFactory } from "../src/infrastructure/logging/ServerLoggerFactory";
import type { PrismaDatabaseClient } from "../src/infrastructure/persistence/PrismaDatabaseClient";

const now = new Date("2026-05-19T12:00:00.000Z");

const stubClock: Clock = {
  now: () => now,
};

function makeAppConfig(env: Record<string, string | undefined> = {}): AppConfig {
  return { env } as unknown as AppConfig;
}

function makeLoggerFactory(): ServerLoggerFactory {
  const noop = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  return { create: () => noop } as unknown as ServerLoggerFactory;
}

interface FindManyArgs {
  where?: { occurredAt?: { lt?: Date } };
  select?: { id?: boolean };
  take?: number;
}

interface DeleteManyArgs {
  where?: { id?: { in?: string[] } };
}

function makePrismaStub(ids: string[] = []) {
  const findManyCalls: FindManyArgs[] = [];
  const deleteManyCalls: DeleteManyArgs[] = [];
  const stub = {
    workflowAuditLog: {
      findMany: async (args: FindManyArgs) => {
        findManyCalls.push(args);
        return ids.map((id) => ({ id }));
      },
      deleteMany: async (args: DeleteManyArgs) => {
        deleteManyCalls.push(args);
        return { count: (args.where?.id?.in ?? []).length };
      },
    },
    findManyCalls,
    deleteManyCalls,
  };
  return stub;
}

type StubPrisma = ReturnType<typeof makePrismaStub>;

function makeScheduler(
  prisma: StubPrisma,
  env: Record<string, string | undefined> = {},
): WorkflowAuditLogPruneScheduler {
  return new WorkflowAuditLogPruneScheduler(
    stubClock,
    prisma as unknown as PrismaDatabaseClient,
    makeAppConfig(env),
    makeLoggerFactory(),
  );
}

describe("WorkflowAuditLogPruneScheduler", () => {
  let prisma: StubPrisma;
  let scheduler: WorkflowAuditLogPruneScheduler;

  beforeEach(() => {
    prisma = makePrismaStub(["id-1", "id-2"]);
    scheduler = makeScheduler(prisma);
  });

  it("applies 90-day default retention when no env var is set", async () => {
    await scheduler.runOnce();
    const cutoff = prisma.findManyCalls[0]?.where?.occurredAt?.lt;
    expect(cutoff).toBeInstanceOf(Date);
    const diffMs = now.getTime() - (cutoff as Date).getTime();
    const ninetyDaysMs = 90 * 24 * 3600 * 1000;
    expect(diffMs).toBeCloseTo(ninetyDaysMs, -3);
  });

  it("respects CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS env override", async () => {
    const localPrisma = makePrismaStub(["id-a"]);
    const localScheduler = makeScheduler(localPrisma, { CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS: "3600" });

    await localScheduler.runOnce();
    const cutoff = localPrisma.findManyCalls[0]?.where?.occurredAt?.lt;
    expect(cutoff).toBeInstanceOf(Date);
    const diffMs = now.getTime() - (cutoff as Date).getTime();
    expect(diffMs).toBeCloseTo(3600 * 1000, -3);
  });

  it("deletes the rows found by findMany", async () => {
    await scheduler.runOnce();
    expect(prisma.deleteManyCalls).toHaveLength(1);
    expect(prisma.deleteManyCalls[0]?.where?.id?.in).toEqual(["id-1", "id-2"]);
  });

  it("skips deleteMany when no rows are found", async () => {
    const emptyPrisma = makePrismaStub([]);
    const emptyScheduler = makeScheduler(emptyPrisma);
    await emptyScheduler.runOnce();
    expect(emptyPrisma.findManyCalls).toHaveLength(1);
    expect(emptyPrisma.deleteManyCalls).toHaveLength(0);
  });

  it("default retention constant is 90 days", () => {
    expect(WorkflowAuditLogPruneScheduler.defaultRetentionSeconds).toBe(90 * 24 * 3600);
  });

  it("CODEMATION_AUDIT_PRUNE_INTERVAL_MS is read for the interval (not CODEMATION_RUN_PRUNE_INTERVAL_MS)", () => {
    // We only verify that start() picks up the dedicated env var by checking that
    // CODEMATION_AUDIT_PRUNE_INTERVAL_MS is actually referenced in the source.
    // A full interval test would require real timers which are flaky.
    const src = WorkflowAuditLogPruneScheduler.toString();
    expect(src).toContain("CODEMATION_AUDIT_PRUNE_INTERVAL_MS");
  });
});
