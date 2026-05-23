// @vitest-environment node
// Sprint 14 Story 07: Storage growth fixes — integration tests.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OtelIdentityFactory } from "../../src/application/telemetry/OtelIdentityFactory";
import { PrismaTelemetryArtifactStore } from "../../src/infrastructure/persistence/PrismaTelemetryArtifactStore";
import { PrismaWorkflowRunRepository } from "../../src/infrastructure/persistence/PrismaWorkflowRunRepository";
import { PrismaWorkflowSnapshotRepository } from "../../src/infrastructure/persistence/PrismaWorkflowSnapshotRepository";
import type { BinaryStorage, BinaryStorageWriteResult, PersistedRunState } from "@codemation/core";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";

// ---------------------------------------------------------------------------
// Story 07, Fix 1: TelemetryArtifact payload offload
// ---------------------------------------------------------------------------
describe("TelemetryArtifact payload offload to BinaryStorage when payload > 64 KB", () => {
  const session = new IntegrationTestDatabaseSession();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  it("stores small artifacts inline in Postgres and large artifacts via BinaryStorage", async () => {
    const writtenKeys: string[] = [];
    const storageMock: BinaryStorage = {
      driverName: "mock",
      write: async (args) => {
        writtenKeys.push(args.storageKey);
        return { storageKey: args.storageKey, size: 0, sha256: "abc" } as BinaryStorageWriteResult;
      },
      openReadStream: async () => undefined,
      stat: async () => ({ exists: false }),
      delete: async () => undefined,
      deleteMany: async () => undefined,
      listByPrefix: async () => [],
    };

    const prisma = session.transaction!.getPrismaClient();
    // Seed a run so FK constraints are satisfied
    await prisma.run.create({
      data: {
        runId: "run-artifact-test",
        workflowId: "wf-artifact-test",
        startedAt: "2026-05-19T00:00:00.000Z",
        status: "running",
        outputsByNodeJson: "{}",
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    });

    const store = new PrismaTelemetryArtifactStore(prisma as never, new OtelIdentityFactory(), storageMock);

    // Small payload (< 64 KB) — should stay inline
    const smallPayload = "x".repeat(1_000);
    const smallRecord = await store.save({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-artifact-test",
      workflowId: "wf-artifact-test",
      kind: "response",
      contentType: "text/plain",
      payloadText: smallPayload,
    });

    // Large payload (100 KB) — should be offloaded
    const largePayload = "y".repeat(100_000);
    const largeRecord = await store.save({
      traceId: "trace-1",
      spanId: "span-1",
      runId: "run-artifact-test",
      workflowId: "wf-artifact-test",
      kind: "response",
      contentType: "text/plain",
      payloadText: largePayload,
    });

    // Small: no storage key written, payload in DB
    expect(smallRecord.payloadText).toBe(smallPayload);
    expect(smallRecord.payloadStorageKey).toBeUndefined();
    expect(writtenKeys.filter((k) => k.includes(smallRecord.artifactId))).toHaveLength(0);

    // Large: storage key set, payload not in DB row
    expect(largeRecord.payloadStorageKey).toBeDefined();
    expect(largeRecord.payloadText).toBeUndefined();
    expect(writtenKeys.filter((k) => k.includes(largeRecord.artifactId))).toHaveLength(1);

    // DB row for large artifact should have null payloadText and the storage key stored
    const dbRow = await prisma.telemetryArtifact.findUniqueOrThrow({
      where: { artifactId: largeRecord.artifactId },
      select: { payloadText: true, payloadStorageKey: true },
    });
    expect(dbRow.payloadText).toBeNull();
    expect(dbRow.payloadStorageKey).toBe(largeRecord.payloadStorageKey);
  });
});

// ---------------------------------------------------------------------------
// Story 07, Fix 2: Run snapshot deduplication
// ---------------------------------------------------------------------------
describe("WorkflowSnapshot deduplication: same snapshot JSON stored only once", () => {
  const session = new IntegrationTestDatabaseSession();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  it("stores ONE WorkflowSnapshot row for 10 runs with identical snapshot content", async () => {
    const prisma = session.transaction!.getPrismaClient();
    const snapshotRepo = new PrismaWorkflowSnapshotRepository(prisma as never);
    const runRepo = new PrismaWorkflowRunRepository(prisma as never, snapshotRepo);

    const workflowId = "wf-snapshot-dedup";
    const snapshotData = {
      id: workflowId,
      name: "Test workflow",
      nodes: [],
      edges: [],
    };

    const runCount = 10;
    for (let i = 0; i < runCount; i++) {
      const runId = `run-snap-${String(i)}` as PersistedRunState["runId"];
      await runRepo.createRun({
        runId,
        workflowId: workflowId as PersistedRunState["workflowId"],
        startedAt: new Date().toISOString(),
        workflowSnapshot: snapshotData as never,
      });
    }

    // Exactly ONE WorkflowSnapshot row should exist for this workflow
    const snapshots = await prisma.workflowSnapshot.findMany({
      where: { workflowId },
    });
    expect(snapshots).toHaveLength(1);

    // All 10 run rows must reference that single snapshot
    const runs = await prisma.run.findMany({
      where: { workflowId },
      select: { workflowSnapshotId: true },
    });
    expect(runs).toHaveLength(runCount);
    const snapshotIds = new Set(runs.map((r) => r.workflowSnapshotId));
    expect(snapshotIds.size).toBe(1);
    expect([...snapshotIds][0]).toBe(snapshots[0].id);
  });
});
