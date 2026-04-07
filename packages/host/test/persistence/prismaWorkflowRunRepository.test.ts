import { describe, expect, it } from "vitest";

import type { PersistedRunState } from "@codemation/core";

import { PrismaWorkflowRunRepository } from "../../src/infrastructure/persistence/PrismaWorkflowRunRepository";

type FakePrisma = {
  run: {
    findUnique?: (args: unknown) => Promise<unknown>;
    updateMany?: (args: unknown) => Promise<{ count: number }>;
  };
  runWorkItem: {
    findMany?: (args: unknown) => Promise<unknown[]>;
    deleteMany?: (args: unknown) => Promise<void>;
    createMany?: (args: unknown) => Promise<void>;
  };
  executionInstance: {
    findMany?: (args: unknown) => Promise<unknown[]>;
    update?: (args: unknown) => Promise<void>;
    create?: (args: unknown) => Promise<void>;
  };
  runSlotProjection?: {
    upsert?: (args: unknown) => Promise<void>;
    findUnique?: (args: unknown) => Promise<unknown>;
  };
  $transaction?: <T>(work: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

describe("PrismaWorkflowRunRepository", () => {
  it("loads runtime state from normalized rows without legacy state_json", async () => {
    const prisma: FakePrisma = {
      run: {
        findUnique: async () => ({
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: "2026-04-07T10:00:00.000Z",
          finishedAt: null,
          revision: 3,
          status: "pending",
          parentJson: null,
          executionOptionsJson: JSON.stringify({ mode: "debug" }),
          controlJson: null,
          workflowSnapshotJson: null,
          policySnapshotJson: null,
          engineCountersJson: JSON.stringify({ completedNodeActivations: 1 }),
          mutableStateJson: JSON.stringify({ nodesById: {} }),
          outputsByNodeJson: JSON.stringify({}),
        }),
      },
      runWorkItem: {
        findMany: async () => [
          {
            workItemId: "queued-1",
            runId: "run-1",
            workflowId: "wf-1",
            status: "queued",
            targetNodeId: "node-b",
            batchId: "batch-2",
            queueName: null,
            claimToken: null,
            availableAt: "2026-04-07T10:00:02.000Z",
            enqueuedAt: "2026-04-07T10:00:02.000Z",
            itemsIn: 1,
            inputsByPortJson: JSON.stringify({ in: [{ json: { hello: "queue" } }] }),
          },
          {
            workItemId: "act-1",
            runId: "run-1",
            workflowId: "wf-1",
            status: "claimed",
            targetNodeId: "node-a",
            batchId: "batch-1",
            queueName: "workers",
            claimToken: "act-1",
            availableAt: "2026-04-07T10:00:01.000Z",
            enqueuedAt: "2026-04-07T10:00:01.000Z",
            itemsIn: 1,
            inputsByPortJson: JSON.stringify({ in: [{ json: { hello: "pending" } }] }),
          },
        ],
      },
      executionInstance: {
        findMany: async () => [
          {
            instanceId: "run-1:node:node-a:act-1",
            runId: "run-1",
            workflowId: "wf-1",
            slotNodeId: "node-a",
            workflowNodeId: "node-a",
            kind: "workflowNodeActivation",
            connectionKind: null,
            activationId: "act-1",
            batchId: "batch-1",
            runIndex: 1,
            status: "running",
            queuedAt: "2026-04-07T10:00:01.000Z",
            startedAt: "2026-04-07T10:00:03.000Z",
            finishedAt: null,
            updatedAt: "2026-04-07T10:00:03.000Z",
            itemCount: 1,
            inputJson: JSON.stringify({ in: [{ json: { hello: "pending" } }] }),
            outputJson: null,
            errorJson: null,
            inputItemIndicesJson: null,
            outputItemCount: null,
            successfulItemCount: null,
            failedItemCount: null,
            usedPinnedOutput: null,
          },
          {
            instanceId: "inv-1",
            runId: "run-1",
            workflowId: "wf-1",
            slotNodeId: "llm-slot",
            workflowNodeId: "agent-1",
            kind: "connectionInvocation",
            connectionKind: "languageModel",
            activationId: "act-1",
            batchId: "batch-1",
            runIndex: 2,
            status: "completed",
            queuedAt: null,
            startedAt: "2026-04-07T10:00:04.000Z",
            finishedAt: "2026-04-07T10:00:05.000Z",
            updatedAt: "2026-04-07T10:00:05.000Z",
            itemCount: 0,
            inputJson: JSON.stringify({ prompt: "hello" }),
            outputJson: JSON.stringify({ text: "world" }),
            errorJson: null,
            inputItemIndicesJson: null,
            outputItemCount: null,
            successfulItemCount: null,
            failedItemCount: null,
            usedPinnedOutput: null,
          },
        ],
      },
    };
    const repository = new PrismaWorkflowRunRepository(prisma as never);

    const state = await repository.load("run-1");
    const schedulingState = await repository.loadSchedulingState("run-1");

    expect(state).toMatchObject({
      runId: "run-1",
      workflowId: "wf-1",
      revision: 3,
      status: "pending",
    });
    expect(state?.pending?.activationId).toBe("act-1");
    expect(state?.queue).toEqual([
      {
        nodeId: "node-b",
        input: [{ json: { hello: "queue" } }],
        toInput: undefined,
        batchId: "batch-2",
      },
    ]);
    expect(schedulingState).toEqual({
      pending: {
        runId: "run-1",
        activationId: "act-1",
        workflowId: "wf-1",
        nodeId: "node-a",
        itemsIn: 1,
        inputsByPort: { in: [{ json: { hello: "pending" } }] },
        receiptId: "act-1",
        queue: "workers",
        batchId: "batch-1",
        enqueuedAt: "2026-04-07T10:00:01.000Z",
      },
      queue: [
        {
          nodeId: "node-b",
          input: [{ json: { hello: "queue" } }],
          toInput: undefined,
          batchId: "batch-2",
        },
      ],
    });
    expect(state?.nodeSnapshotsByNodeId["node-a"]?.activationId).toBe("act-1");
    expect(state?.connectionInvocations?.map((entry) => entry.invocationId)).toEqual(["inv-1"]);
  });

  it("appends a new execution instance instead of collapsing prior activation history", async () => {
    const createdInstances: Array<Record<string, unknown>> = [];
    const updatedInstances: Array<Record<string, unknown>> = [];
    const createdWorkItems: Array<Record<string, unknown>> = [];
    let runWorkItemDeletes = 0;

    const prisma: FakePrisma = {
      run: {
        updateMany: async () => ({ count: 1 }),
      },
      runWorkItem: {
        deleteMany: async () => {
          runWorkItemDeletes += 1;
        },
        createMany: async (args) => {
          createdWorkItems.push(...((args as { data: Array<Record<string, unknown>> }).data ?? []));
        },
      },
      executionInstance: {
        findMany: async () => [
          {
            instanceId: "run-1:node:node-a:act-1",
            slotNodeId: "node-a",
            runIndex: 1,
          },
        ],
        update: async (args) => {
          updatedInstances.push(args as Record<string, unknown>);
        },
        create: async (args) => {
          createdInstances.push((args as { data: Record<string, unknown> }).data);
        },
      },
      runSlotProjection: {
        upsert: async () => undefined,
      },
    };
    prisma.$transaction = async (work) => await work(prisma);

    const repository = new PrismaWorkflowRunRepository(prisma as never);
    const state = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-04-07T10:00:00.000Z",
      revision: 1,
      status: "pending",
      pending: {
        runId: "run-1",
        activationId: "act-2",
        workflowId: "wf-1",
        nodeId: "node-a",
        itemsIn: 1,
        inputsByPort: { in: [{ json: { hello: "again" } }] },
        receiptId: "act-2",
        batchId: "batch-2",
        enqueuedAt: "2026-04-07T10:00:06.000Z",
      },
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "node-a": {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-a",
          activationId: "act-2",
          status: "queued",
          queuedAt: "2026-04-07T10:00:06.000Z",
          updatedAt: "2026-04-07T10:00:06.000Z",
          inputsByPort: { in: [{ json: { hello: "again" } }] },
        },
      },
      connectionInvocations: [],
    } satisfies PersistedRunState;

    await repository.save(state);

    expect(runWorkItemDeletes).toBe(1);
    expect(createdWorkItems).toHaveLength(1);
    expect(createdWorkItems[0]).toMatchObject({
      workItemId: "act-2",
      status: "claimed",
      targetNodeId: "node-a",
      batchId: "batch-2",
    });
    expect(updatedInstances).toHaveLength(0);
    expect(createdInstances).toHaveLength(1);
    expect(createdInstances[0]).toMatchObject({
      instanceId: "run-1:node:node-a:act-2",
      slotNodeId: "node-a",
      runIndex: 2,
      activationId: "act-2",
      status: "queued",
    });
  });

  it("stores only fallback run outputs and keeps projections lightweight", async () => {
    const runUpdates: Array<Record<string, unknown>> = [];
    const projectionUpserts: Array<Record<string, unknown>> = [];
    const prisma: FakePrisma = {
      run: {
        updateMany: async (args) => {
          runUpdates.push(args as Record<string, unknown>);
          return { count: 1 };
        },
      },
      runWorkItem: {
        deleteMany: async () => undefined,
        createMany: async () => undefined,
      },
      executionInstance: {
        findMany: async () => [],
        update: async () => undefined,
        create: async () => undefined,
      },
      runSlotProjection: {
        upsert: async (args) => {
          projectionUpserts.push(args as Record<string, unknown>);
        },
      },
    };
    prisma.$transaction = async (work) => await work(prisma);

    const repository = new PrismaWorkflowRunRepository(prisma as never);
    await repository.save({
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-04-07T10:00:00.000Z",
      revision: 1,
      status: "completed",
      finishedAt: "2026-04-07T10:00:03.000Z",
      pending: undefined,
      queue: [],
      mutableState: { nodesById: {} },
      outputsByNode: {
        "node-a": { main: [{ json: { from: "snapshot" } }] },
        "node-b": { main: [{ json: { from: "fallback" } }] },
      },
      nodeSnapshotsByNodeId: {
        "node-a": {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-a",
          activationId: "act-1",
          status: "completed",
          queuedAt: "2026-04-07T10:00:01.000Z",
          startedAt: "2026-04-07T10:00:02.000Z",
          finishedAt: "2026-04-07T10:00:03.000Z",
          updatedAt: "2026-04-07T10:00:03.000Z",
          outputs: { main: [{ json: { from: "snapshot" } }] },
        },
      },
      connectionInvocations: [],
    } satisfies PersistedRunState);

    const runUpdate = runUpdates[0] as { data: { outputsByNodeJson: string } };
    expect(JSON.parse(runUpdate.data.outputsByNodeJson)).toEqual({
      "node-b": { main: [{ json: { from: "fallback" } }] },
    });
    const projectionUpsert = projectionUpserts[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(projectionUpsert.create).not.toHaveProperty("mutableStateJson");
    expect(projectionUpsert.update).not.toHaveProperty("mutableStateJson");
  });

  it("builds execution detail and binary keys from normalized persistence rows", async () => {
    const prisma: FakePrisma = {
      run: {
        findUnique: async () => ({
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: "2026-04-07T10:00:00.000Z",
          finishedAt: "2026-04-07T10:00:10.000Z",
          status: "completed",
          revision: 4,
          parentJson: null,
          executionOptionsJson: null,
          controlJson: null,
          workflowSnapshotJson: JSON.stringify({ id: "wf-1", name: "Workflow", nodes: [], edges: [] }),
          policySnapshotJson: null,
          engineCountersJson: null,
          mutableStateJson: JSON.stringify({
            nodesById: {
              "node-a": {
                pinnedOutputsByPort: {
                  main: [
                    {
                      json: {},
                      binary: { kept: { id: "bin-3", storageKey: "storage-key-3", mimeType: "text/plain", size: 1 } },
                    },
                  ],
                },
              },
            },
          }),
          outputsByNodeJson: JSON.stringify({
            "node-a": {
              main: [
                {
                  json: {},
                  binary: { result: { id: "bin-1", storageKey: "storage-key-1", mimeType: "text/plain", size: 1 } },
                },
              ],
            },
          }),
        }),
      },
      runSlotProjection: {
        upsert: async () => undefined,
        findUnique: async () => ({
          runId: "run-1",
          workflowId: "wf-1",
          revision: 4,
          updatedAt: "2026-04-07T10:00:10.000Z",
          slotStatesJson: JSON.stringify({
            slotStatesByNodeId: {
              "node-a": {
                latestInstanceId: "run-1:node:node-a:act-1",
                latestTerminalInstanceId: "run-1:node:node-a:act-1",
                latestStatus: "completed",
                invocationCount: 2,
                runCount: 1,
              },
            },
          }),
          mutableStateJson: JSON.stringify({ nodesById: {} }),
        }),
      },
      executionInstance: {
        findMany: async (args) => {
          const select = (args as { select?: Record<string, boolean> }).select;
          if (select) {
            return [
              {
                inputJson: JSON.stringify({
                  in: [
                    {
                      json: {},
                      binary: { prompt: { id: "bin-2", storageKey: "storage-key-2", mimeType: "text/plain", size: 1 } },
                    },
                  ],
                }),
                outputJson: null,
              },
            ];
          }
          return [
            {
              instanceId: "run-1:node:node-a:act-1",
              runId: "run-1",
              workflowId: "wf-1",
              slotNodeId: "node-a",
              workflowNodeId: "node-a",
              kind: "workflowNodeActivation",
              connectionKind: null,
              activationId: "act-1",
              batchId: "batch-1",
              runIndex: 1,
              parentInstanceId: null,
              status: "completed",
              queuedAt: "2026-04-07T10:00:01.000Z",
              startedAt: "2026-04-07T10:00:02.000Z",
              finishedAt: "2026-04-07T10:00:03.000Z",
              updatedAt: "2026-04-07T10:00:03.000Z",
              itemCount: 1,
              inputJson: JSON.stringify({ in: [{ json: { hello: "world" } }] }),
              outputJson: JSON.stringify({ main: [{ json: { ok: true } }] }),
              errorJson: null,
              inputItemIndicesJson: null,
              outputItemCount: 1,
              successfulItemCount: 1,
              failedItemCount: 0,
              usedPinnedOutput: null,
            },
          ];
        },
      },
      runWorkItem: {},
    };
    const repository = new PrismaWorkflowRunRepository(prisma as never);

    const detail = await repository.loadRunDetail("run-1");
    const binaryKeys = await repository.listBinaryStorageKeys("run-1");

    expect(detail?.slotStates).toEqual([
      {
        slotNodeId: "node-a",
        latestInstanceId: "run-1:node:node-a:act-1",
        latestTerminalInstanceId: "run-1:node:node-a:act-1",
        latestRunningInstanceId: undefined,
        status: "completed",
        invocationCount: 2,
        runCount: 1,
      },
    ]);
    expect(detail?.executionInstances[0]).toMatchObject({
      instanceId: "run-1:node:node-a:act-1",
      slotNodeId: "node-a",
      workflowNodeId: "node-a",
      status: "completed",
    });
    expect(binaryKeys).toEqual(["storage-key-1", "storage-key-2", "storage-key-3"]);
  });

  it("retries concurrent run updates by merging the latest invocation history", async () => {
    const createdInstances: Array<Record<string, unknown>> = [];
    const updatedInstances: Array<Record<string, unknown>> = [];
    let runUpdateCalls = 0;

    const prisma: FakePrisma = {
      run: {
        findUnique: async () => ({
          runId: "run-1",
          workflowId: "wf-1",
          startedAt: "2026-04-07T10:00:00.000Z",
          finishedAt: null,
          revision: 2,
          status: "pending",
          parentJson: null,
          executionOptionsJson: null,
          controlJson: null,
          workflowSnapshotJson: null,
          policySnapshotJson: null,
          engineCountersJson: JSON.stringify({ completedNodeActivations: 1 }),
          mutableStateJson: JSON.stringify({ nodesById: {} }),
          outputsByNodeJson: JSON.stringify({}),
        }),
        updateMany: async () => ({ count: runUpdateCalls++ === 0 ? 0 : 1 }),
      },
      runWorkItem: {
        findMany: async () => [],
        deleteMany: async () => undefined,
        createMany: async () => undefined,
      },
      executionInstance: {
        findMany: async (args) => {
          if ((args as { select?: unknown }).select) {
            return [{ instanceId: "inv-1", slotNodeId: "llm-slot", runIndex: 1 }];
          }
          return [
            {
              instanceId: "inv-1",
              runId: "run-1",
              workflowId: "wf-1",
              slotNodeId: "llm-slot",
              workflowNodeId: "agent-1",
              kind: "connectionInvocation",
              connectionKind: "languageModel",
              activationId: "act-1",
              batchId: "batch-1",
              runIndex: 1,
              parentInstanceId: null,
              status: "completed",
              queuedAt: null,
              startedAt: "2026-04-07T10:00:01.000Z",
              finishedAt: "2026-04-07T10:00:02.000Z",
              updatedAt: "2026-04-07T10:00:02.000Z",
              itemCount: 0,
              inputJson: JSON.stringify({ prompt: "hello" }),
              outputJson: JSON.stringify({ text: "world" }),
              errorJson: null,
              inputItemIndicesJson: null,
              outputItemCount: null,
              successfulItemCount: null,
              failedItemCount: null,
              usedPinnedOutput: null,
            },
          ];
        },
        update: async (args) => {
          updatedInstances.push(args as Record<string, unknown>);
        },
        create: async (args) => {
          createdInstances.push((args as { data: Record<string, unknown> }).data);
        },
      },
      runSlotProjection: {
        upsert: async () => undefined,
      },
    };
    prisma.$transaction = async (work) => await work(prisma);

    const repository = new PrismaWorkflowRunRepository(prisma as never);
    await repository.save({
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-04-07T10:00:00.000Z",
      revision: 1,
      status: "pending",
      pending: {
        runId: "run-1",
        activationId: "act-2",
        workflowId: "wf-1",
        nodeId: "node-a",
        itemsIn: 1,
        inputsByPort: { in: [{ json: { hello: "again" } }] },
        receiptId: "act-2",
        batchId: "batch-2",
        enqueuedAt: "2026-04-07T10:00:03.000Z",
      },
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "node-a": {
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "node-a",
          activationId: "act-2",
          status: "queued",
          queuedAt: "2026-04-07T10:00:03.000Z",
          updatedAt: "2026-04-07T10:00:03.000Z",
          inputsByPort: { in: [{ json: { hello: "again" } }] },
        },
      },
      connectionInvocations: [],
    } satisfies PersistedRunState);

    expect(runUpdateCalls).toBe(2);
    expect(updatedInstances).toHaveLength(1);
    expect(updatedInstances[0]).toMatchObject({
      where: { instanceId: "inv-1" },
    });
    expect(createdInstances.at(-1)).toMatchObject({
      instanceId: "run-1:node:node-a:act-2",
      slotNodeId: "node-a",
      activationId: "act-2",
    });
  });
});
