import { describe, expect, it } from "vitest";
import { WorkflowAuditLogPruneScheduler } from "../../src/application/WorkflowAuditLogPruneScheduler";
import type { Logger, LoggerFactory } from "../../src/application/logging/Logger";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

class TestLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  info(message: string): void {
    this.infos.push(message);
  }
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

function makeAppConfig(env: NodeJS.ProcessEnv = {}): AppConfig {
  return { env } as unknown as AppConfig;
}

function makeClock(now: Date): object {
  return { now: () => now };
}

function makePrisma(rowsToFind: { id: string }[]): object {
  const deleted: string[] = [];
  return {
    workflowAuditLog: {
      findMany: async () => rowsToFind,
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        deleted.push(...args.where.id.in);
        return { count: args.where.id.in.length };
      },
    },
    _deleted: deleted,
  };
}

function makeScheduler(
  prisma: object,
  appConfig: AppConfig,
  loggerFactory = new TestLoggerFactory(),
): WorkflowAuditLogPruneScheduler {
  return new WorkflowAuditLogPruneScheduler(
    makeClock(new Date("2026-01-01T12:00:00.000Z")) as never,
    prisma as never,
    appConfig,
    loggerFactory as never,
  );
}

describe("WorkflowAuditLogPruneScheduler.runOnce", () => {
  it("does nothing when no rows found", async () => {
    const prisma = makePrisma([]);
    const loggerFactory = new TestLoggerFactory();
    const scheduler = makeScheduler(prisma, makeAppConfig(), loggerFactory);
    await scheduler.runOnce();
    expect(loggerFactory.logger.infos).toHaveLength(0);
  });

  it("deletes rows older than retention period and logs", async () => {
    const rows = [{ id: "audit-1" }, { id: "audit-2" }];
    const prisma = makePrisma(rows) as { workflowAuditLog: object; _deleted: string[] };
    const loggerFactory = new TestLoggerFactory();
    const scheduler = makeScheduler(prisma, makeAppConfig(), loggerFactory);
    await scheduler.runOnce();
    expect((prisma as never as { _deleted: string[] })._deleted).toEqual(["audit-1", "audit-2"]);
    expect(loggerFactory.logger.infos).toHaveLength(1);
    expect(loggerFactory.logger.infos[0]).toContain("2 row(s)");
  });

  it("respects custom CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS", async () => {
    const calledWith: Array<{ lt: Date }> = [];
    const prisma = {
      workflowAuditLog: {
        findMany: async (args: { where: { occurredAt: { lt: Date } } }) => {
          calledWith.push(args.where.occurredAt);
          return [];
        },
        deleteMany: async () => ({}),
      },
    };
    const scheduler = makeScheduler(prisma, makeAppConfig({ CODEMATION_AUDIT_WORKFLOW_RETENTION_SECONDS: "3600" }));
    await scheduler.runOnce();
    // cutoff = 2026-01-01T12:00:00.000Z - 3600s = 2026-01-01T11:00:00.000Z
    expect(calledWith).toHaveLength(1);
    expect(calledWith[0].lt.toISOString()).toBe("2026-01-01T11:00:00.000Z");
  });

  it("uses CODEMATION_TELEMETRY_PRUNE_LIMIT for take", async () => {
    const calledWith: Array<{ take: number }> = [];
    const prisma = {
      workflowAuditLog: {
        findMany: async (args: { take: number }) => {
          calledWith.push(args);
          return [];
        },
        deleteMany: async () => ({}),
      },
    };
    const scheduler = makeScheduler(prisma, makeAppConfig({ CODEMATION_TELEMETRY_PRUNE_LIMIT: "100" }));
    await scheduler.runOnce();
    expect(calledWith[0].take).toBe(100);
  });
});

describe("WorkflowAuditLogPruneScheduler.start/stop", () => {
  it("does not run when CODEMATION_AUDIT_PRUNE_ENABLED is false", () => {
    let calls = 0;
    const prisma = {
      workflowAuditLog: {
        findMany: async () => {
          calls++;
          return [];
        },
        deleteMany: async () => ({}),
      },
    };
    const scheduler = makeScheduler(prisma, makeAppConfig({ CODEMATION_AUDIT_PRUNE_ENABLED: "false" }));
    scheduler.start();
    scheduler.stop();
    expect(calls).toBe(0);
  });

  it("stop is safe when timer was never started", () => {
    const scheduler = makeScheduler(makePrisma([]), makeAppConfig({ CODEMATION_AUDIT_PRUNE_ENABLED: "false" }));
    expect(() => scheduler.stop()).not.toThrow();
  });

  it("start is idempotent (second call does not create another timer)", async () => {
    const calls: number[] = [];
    const prisma = {
      workflowAuditLog: {
        findMany: async () => {
          calls.push(1);
          return [];
        },
        deleteMany: async () => ({}),
      },
    };
    const scheduler = makeScheduler(prisma, makeAppConfig({ CODEMATION_RUN_PRUNE_INTERVAL_MS: "99999000" }));
    scheduler.start();
    scheduler.start(); // second call should be ignored
    // Let the first runScheduledTick (fired immediately) complete
    await new Promise((resolve) => setTimeout(resolve, 10));
    scheduler.stop();
    // runOnce was called once from the first start (immediate tick)
    expect(calls.length).toBe(1);
  });

  it("stop clears the interval timer", async () => {
    const calls: number[] = [];
    const prisma = {
      workflowAuditLog: {
        findMany: async () => {
          calls.push(1);
          return [];
        },
        deleteMany: async () => ({}),
      },
    };
    const scheduler = makeScheduler(prisma, makeAppConfig({ CODEMATION_RUN_PRUNE_INTERVAL_MS: "99999000" }));
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    scheduler.stop();
    const countAfterStop = calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    // No more calls after stop
    expect(calls.length).toBe(countAfterStop);
  });
});

describe("WorkflowAuditLogPruneScheduler runScheduledTick error path", () => {
  it("swallows errors from runOnce and logs a warning", async () => {
    const prisma = {
      workflowAuditLog: {
        findMany: async () => {
          throw new Error("DB is down");
        },
        deleteMany: async () => ({}),
      },
    };
    const loggerFactory = new TestLoggerFactory();
    const scheduler = makeScheduler(prisma, makeAppConfig(), loggerFactory);
    // Trigger the scheduled tick indirectly via start
    scheduler.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    scheduler.stop();
    expect(loggerFactory.logger.warns.some((w) => w.includes("DB is down"))).toBe(true);
  });
});
