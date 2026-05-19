// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaWorkflowAuditLogRepository } from "../../src/audit/PrismaWorkflowAuditLogRepository";
import type { WorkflowAuditEntry } from "../../src/audit/IAuditEmitter";
import type { PrismaDatabaseClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

class AuditLogIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();

  async start(): Promise<void> {
    await this.session.start();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  createRepository(): PrismaWorkflowAuditLogRepository {
    return new PrismaWorkflowAuditLogRepository(this.prismaClient());
  }

  prismaClient(): PrismaDatabaseClient {
    if (!this.session.transaction) {
      throw new Error("AuditLogIntegrationContext.start() must be called first.");
    }
    return this.session.transaction.getPrismaClient();
  }
}

function makeEntry(overrides: Partial<WorkflowAuditEntry> = {}): WorkflowAuditEntry {
  return {
    id: globalThis.crypto.randomUUID(),
    occurredAt: "2026-05-19T10:00:00.000Z",
    actor: { userId: "system" },
    action: "workflow.node.completed",
    resource: { type: "node", id: "node-A" },
    outcome: "success",
    workflowId: "wf-integration-test",
    runId: "run-integration-test",
    nodeId: "node-A",
    ...overrides,
  };
}

describe("WorkflowAuditLog persistence", () => {
  const ctx = new AuditLogIntegrationContext();

  beforeAll(async () => {
    await ctx.start();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("persists a success audit entry", async () => {
    const repo = ctx.createRepository();
    const entry = makeEntry();
    await repo.emit(entry);

    const row = await ctx.prismaClient().workflowAuditLog.findUnique({
      where: { id: entry.id },
    });
    expect(row).not.toBeNull();
    expect(row?.actorUserId).toBe("system");
    expect(row?.action).toBe("workflow.node.completed");
    expect(row?.outcome).toBe("success");
    expect(row?.workflowId).toBe("wf-integration-test");
    expect(row?.runId).toBe("run-integration-test");
    expect(row?.nodeId).toBe("node-A");
  });

  it("persists a failure audit entry with errorCode", async () => {
    const repo = ctx.createRepository();
    const entry = makeEntry({
      action: "workflow.node.failed",
      outcome: "failure",
      errorCode: "TimeoutError",
    });
    await repo.emit(entry);

    const row = await ctx.prismaClient().workflowAuditLog.findUnique({
      where: { id: entry.id },
    });
    expect(row?.outcome).toBe("failure");
    expect(row?.errorCode).toBe("TimeoutError");
  });

  it("supports querying by workflowId ordered by occurredAt", async () => {
    const repo = ctx.createRepository();
    const wfId = `wf-query-${globalThis.crypto.randomUUID().slice(0, 8)}`;
    const entries = [
      makeEntry({ workflowId: wfId, occurredAt: "2026-05-19T09:00:00.000Z" }),
      makeEntry({ workflowId: wfId, occurredAt: "2026-05-19T10:00:00.000Z" }),
      makeEntry({ workflowId: wfId, occurredAt: "2026-05-19T11:00:00.000Z" }),
    ];
    for (const e of entries) {
      await repo.emit(e);
    }

    const rows = await ctx.prismaClient().workflowAuditLog.findMany({
      where: { workflowId: wfId },
      orderBy: { occurredAt: "asc" },
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.occurredAt.toISOString()).toBe("2026-05-19T09:00:00.000Z");
    expect(rows[2]!.occurredAt.toISOString()).toBe("2026-05-19T11:00:00.000Z");
  });
});
