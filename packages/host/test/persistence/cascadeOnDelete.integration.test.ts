// @vitest-environment node

/**
 * Cascade-on-delete integration tests (Sprint 13 Story C).
 *
 * For each `onDelete: Cascade` relationship in schema.postgresql.prisma:
 *   - Creates parent + N child rows via the Prisma client.
 *   - Deletes the parent.
 *   - Asserts child count is 0 (cascade fired at the DB level).
 *
 * Relationships declared with `onDelete: Cascade` in schema.postgresql.prisma:
 *   1. RunWorkItem.run      → Run          (line 62)
 *   2. ExecutionInstance.run → Run         (line 110)
 *   3. RunSlotProjection.run → Run         (line 126)
 *   4. TestAssertion.run    → Run          (line 180)
 *   5. TestAssertion.testSuiteRun → TestSuiteRun (line 181)
 *   6. UserInvite.user      → User         (line 413)
 *   7. Account.user         → User         (line 441)
 *   8. Session.user         → User         (line 456)
 *
 * Relationships mentioned in the spec discovery audit that are NOT declared in the schema:
 *   - Credential → instances: CredentialInstance, CredentialSecretMaterial,
 *     CredentialOAuth2Material, etc. share an instanceId column but have NO
 *     `@relation` with `onDelete: Cascade` in schema.postgresql.prisma. This
 *     is a gap — no test is written for it, per Story C instructions ("note it,
 *     do not add it").
 *   - Workspace → workflows / runs: No `Workspace` model exists in
 *     schema.postgresql.prisma. Noted; no test.
 */

import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

function makeRunData(runId: string, workflowId: string) {
  return {
    runId,
    workflowId,
    startedAt: nowIso(),
    status: "completed",
    outputsByNodeJson: "{}",
    updatedAt: nowIso(),
  };
}

function makeUserData() {
  return {
    id: randomUUID(),
    email: `test-${randomUUID()}@cascade-test.example`,
    name: "Cascade Test User",
  };
}

// ---------------------------------------------------------------------------
// Harness context
// ---------------------------------------------------------------------------

class CascadeOnDeleteIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();

  async start(): Promise<void> {
    await this.session.start();
  }

  async afterEach(): Promise<void> {
    await this.session.afterEach();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  prisma(): PrismaClient {
    if (!this.session.transaction) {
      throw new Error("CascadeOnDeleteIntegrationContext.start() must be called before using Prisma.");
    }
    return this.session.transaction.getPrismaClient();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("cascade-on-delete integration tests", () => {
  const ctx = new CascadeOnDeleteIntegrationContext();

  beforeAll(async () => {
    await ctx.start();
  });

  afterEach(async () => {
    await ctx.afterEach();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  // -------------------------------------------------------------------------
  // Run → RunWorkItem
  // -------------------------------------------------------------------------

  it("deleting a Run cascades to RunWorkItem rows", async () => {
    const db = ctx.prisma();
    const runId = `cascade-run-wi-${randomUUID()}`;

    await db.run.create({ data: makeRunData(runId, "wf-cascade-wi") });

    await db.runWorkItem.createMany({
      data: [
        {
          workItemId: `wi-${randomUUID()}`,
          runId,
          workflowId: "wf-cascade-wi",
          status: "queued",
          targetNodeId: "node-a",
          batchId: "batch-1",
          availableAt: nowIso(),
          enqueuedAt: nowIso(),
          itemsIn: 1,
          inputsByPortJson: "{}",
        },
        {
          workItemId: `wi-${randomUUID()}`,
          runId,
          workflowId: "wf-cascade-wi",
          status: "queued",
          targetNodeId: "node-b",
          batchId: "batch-2",
          availableAt: nowIso(),
          enqueuedAt: nowIso(),
          itemsIn: 1,
          inputsByPortJson: "{}",
        },
      ],
    });

    const beforeCount = await db.runWorkItem.count({ where: { runId } });
    expect(beforeCount).toBe(2);

    await db.run.delete({ where: { runId } });

    const afterCount = await db.runWorkItem.count({ where: { runId } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Run → ExecutionInstance
  // -------------------------------------------------------------------------

  it("deleting a Run cascades to ExecutionInstance rows", async () => {
    const db = ctx.prisma();
    const runId = `cascade-run-ei-${randomUUID()}`;

    await db.run.create({ data: makeRunData(runId, "wf-cascade-ei") });

    await db.executionInstance.createMany({
      data: [
        {
          instanceId: `inst-${randomUUID()}`,
          runId,
          workflowId: "wf-cascade-ei",
          slotNodeId: "node-a",
          workflowNodeId: "node-a",
          kind: "workflowNodeActivation",
          batchId: "batch-1",
          runIndex: 1,
          status: "completed",
          itemCount: 1,
          updatedAt: nowIso(),
        },
        {
          instanceId: `inst-${randomUUID()}`,
          runId,
          workflowId: "wf-cascade-ei",
          slotNodeId: "node-b",
          workflowNodeId: "node-b",
          kind: "workflowNodeActivation",
          batchId: "batch-2",
          runIndex: 2,
          status: "completed",
          itemCount: 1,
          updatedAt: nowIso(),
        },
      ],
    });

    const beforeCount = await db.executionInstance.count({ where: { runId } });
    expect(beforeCount).toBe(2);

    await db.run.delete({ where: { runId } });

    const afterCount = await db.executionInstance.count({ where: { runId } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Run → RunSlotProjection
  // -------------------------------------------------------------------------

  it("deleting a Run cascades to RunSlotProjection", async () => {
    const db = ctx.prisma();
    const runId = `cascade-run-sp-${randomUUID()}`;

    await db.run.create({ data: makeRunData(runId, "wf-cascade-sp") });
    await db.runSlotProjection.create({
      data: {
        runId,
        workflowId: "wf-cascade-sp",
        revision: 1,
        updatedAt: nowIso(),
        slotStatesJson: "{}",
      },
    });

    const beforeCount = await db.runSlotProjection.count({ where: { runId } });
    expect(beforeCount).toBe(1);

    await db.run.delete({ where: { runId } });

    const afterCount = await db.runSlotProjection.count({ where: { runId } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Run → TestAssertion
  // -------------------------------------------------------------------------

  it("deleting a Run cascades to TestAssertion rows", async () => {
    const db = ctx.prisma();
    const runId = `cascade-run-ta-${randomUUID()}`;
    const suiteRunId = `suite-${randomUUID()}`;

    await db.testSuiteRun.create({
      data: {
        id: suiteRunId,
        workflowId: "wf-cascade-ta",
        triggerNodeId: "trigger-1",
        status: "completed",
        concurrency: 1,
        startedAt: nowIso(),
        updatedAt: nowIso(),
      },
    });

    await db.run.create({
      data: { ...makeRunData(runId, "wf-cascade-ta"), testSuiteRunId: suiteRunId },
    });

    await db.testAssertion.createMany({
      data: [
        {
          id: `assert-${randomUUID()}`,
          runId,
          testSuiteRunId: suiteRunId,
          workflowId: "wf-cascade-ta",
          nodeId: "node-a",
          name: "assert-1",
          score: 1.0,
          errored: false,
          createdAt: nowIso(),
        },
        {
          id: `assert-${randomUUID()}`,
          runId,
          testSuiteRunId: suiteRunId,
          workflowId: "wf-cascade-ta",
          nodeId: "node-a",
          name: "assert-2",
          score: 0.5,
          errored: false,
          createdAt: nowIso(),
        },
      ],
    });

    const beforeCount = await db.testAssertion.count({ where: { runId } });
    expect(beforeCount).toBe(2);

    // Delete Run — its TestAssertion rows should cascade away.
    await db.run.delete({ where: { runId } });

    const afterCount = await db.testAssertion.count({ where: { runId } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // TestSuiteRun → TestAssertion
  // -------------------------------------------------------------------------

  it("deleting a TestSuiteRun cascades to TestAssertion rows", async () => {
    const db = ctx.prisma();
    const suiteRunId = `suite-ta-${randomUUID()}`;
    const runId = `run-suite-ta-${randomUUID()}`;

    await db.testSuiteRun.create({
      data: {
        id: suiteRunId,
        workflowId: "wf-suite-cascade",
        triggerNodeId: "trigger-1",
        status: "completed",
        concurrency: 1,
        startedAt: nowIso(),
        updatedAt: nowIso(),
      },
    });

    await db.run.create({
      data: { ...makeRunData(runId, "wf-suite-cascade"), testSuiteRunId: suiteRunId },
    });

    await db.testAssertion.createMany({
      data: [
        {
          id: `assert-${randomUUID()}`,
          runId,
          testSuiteRunId: suiteRunId,
          workflowId: "wf-suite-cascade",
          nodeId: "node-a",
          name: "assert-1",
          score: 1.0,
          errored: false,
          createdAt: nowIso(),
        },
        {
          id: `assert-${randomUUID()}`,
          runId,
          testSuiteRunId: suiteRunId,
          workflowId: "wf-suite-cascade",
          nodeId: "node-b",
          name: "assert-2",
          score: 0.8,
          errored: false,
          createdAt: nowIso(),
        },
      ],
    });

    const beforeCount = await db.testAssertion.count({ where: { testSuiteRunId: suiteRunId } });
    expect(beforeCount).toBe(2);

    // Delete TestSuiteRun — its TestAssertion rows should cascade away.
    // Run must be deleted first because Run has a FK to TestSuiteRun without cascade
    // from TestSuiteRun's side (TestSuiteRun.runs is a relation but Run.testSuiteRunId
    // has no onDelete declared, defaulting to Restrict/NoAction in Postgres).
    await db.run.delete({ where: { runId } });
    await db.testSuiteRun.delete({ where: { id: suiteRunId } });

    const afterCount = await db.testAssertion.count({ where: { testSuiteRunId: suiteRunId } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // User → UserInvite
  // -------------------------------------------------------------------------

  it("deleting a User cascades to UserInvite rows", async () => {
    const db = ctx.prisma();
    const userData = makeUserData();

    await db.user.create({ data: userData });

    await db.userInvite.createMany({
      data: [
        {
          id: randomUUID(),
          userId: userData.id,
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-05-19T00:00:00.000Z"),
        },
        {
          id: randomUUID(),
          userId: userData.id,
          tokenHash: `hash-${randomUUID()}`,
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          createdAt: new Date("2026-05-19T00:00:00.000Z"),
        },
      ],
    });

    const beforeCount = await db.userInvite.count({ where: { userId: userData.id } });
    expect(beforeCount).toBe(2);

    await db.user.delete({ where: { id: userData.id } });

    const afterCount = await db.userInvite.count({ where: { userId: userData.id } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // User → Account
  // -------------------------------------------------------------------------

  it("deleting a User cascades to Account rows", async () => {
    const db = ctx.prisma();
    const userData = makeUserData();

    await db.user.create({ data: userData });

    await db.account.createMany({
      data: [
        {
          id: randomUUID(),
          userId: userData.id,
          provider: "github",
          providerAccountId: `gh-${randomUUID()}`,
        },
        {
          id: randomUUID(),
          userId: userData.id,
          provider: "google",
          providerAccountId: `google-${randomUUID()}`,
        },
      ],
    });

    const beforeCount = await db.account.count({ where: { userId: userData.id } });
    expect(beforeCount).toBe(2);

    await db.user.delete({ where: { id: userData.id } });

    const afterCount = await db.account.count({ where: { userId: userData.id } });
    expect(afterCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // User → Session
  // -------------------------------------------------------------------------

  it("deleting a User cascades to Session rows", async () => {
    const db = ctx.prisma();
    const userData = makeUserData();

    await db.user.create({ data: userData });

    await db.session.createMany({
      data: [
        {
          id: randomUUID(),
          sessionToken: `token-${randomUUID()}`,
          userId: userData.id,
          expires: new Date("2099-01-01T00:00:00.000Z"),
        },
        {
          id: randomUUID(),
          sessionToken: `token-${randomUUID()}`,
          userId: userData.id,
          expires: new Date("2099-01-01T00:00:00.000Z"),
        },
      ],
    });

    const beforeCount = await db.session.count({ where: { userId: userData.id } });
    expect(beforeCount).toBe(2);

    await db.user.delete({ where: { id: userData.id } });

    const afterCount = await db.session.count({ where: { userId: userData.id } });
    expect(afterCount).toBe(0);
  });
});
