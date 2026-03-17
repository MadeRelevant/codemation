// @vitest-environment node

import path from "node:path";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import type { PersistedRunState, WorkflowDefinition } from "@codemation/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { WorkflowDebuggerOverlayResponse } from "../../src/application/contracts/WorkflowDebuggerContracts";
import type { CodemationBinding } from "../../src/presentation/config/CodemationBinding";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { PrismaClient } from "../../src/infrastructure/persistence/generated/prisma/client.js";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { PostgresIntegrationDatabase } from "./testkit/PostgresIntegrationDatabase";
import { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

class WorkflowDebugSessionIntegrationFixture {
  static readonly workflowId = "wf.http.debug-session";
  static readonly nodeIds = ["node_1", "node_2", "node_3", "node_4", "node_5", "node_6"] as const;

  static createConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      runtime: {
        eventBus: {
          kind: "memory",
        },
        scheduler: {
          kind: "local",
        },
      },
    };
  }

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "HTTP debug session workflow",
    })
      .trigger(new ManualTrigger("Node 1", this.nodeIds[0]))
      .then(new MapData("Node 2", (item) => item.json, this.nodeIds[1]))
      .then(new MapData("Node 3", (item) => item.json, this.nodeIds[2]))
      .then(new MapData("Node 4", (item) => item.json, this.nodeIds[3]))
      .then(new MapData("Node 5", (item) => item.json, this.nodeIds[4]))
      .then(new MapData("Node 6", (item) => item.json, this.nodeIds[5]))
      .build();
  }

  static async waitForRunToComplete(harness: FrontendHttpIntegrationHarness, runId: string): Promise<PersistedRunState> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.runState(runId),
      });
      if (response.statusCode === 200) {
        const state = response.json<PersistedRunState>();
        if (state.status === "completed") {
          return state;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Run ${runId} did not complete before the timeout elapsed.`);
  }
}

class WorkflowDebugSessionIntegrationContext {
  sharedDatabase: PostgresIntegrationDatabase | null = null;
  harness: FrontendHttpIntegrationHarness | null = null;
  transaction: PostgresRollbackTransaction | null = null;

  async prepareSharedDatabase(): Promise<void> {
    if (this.sharedDatabase) {
      return;
    }
    this.sharedDatabase = await PostgresIntegrationDatabase.create();
  }

  async start(): Promise<FrontendHttpIntegrationHarness> {
    const database = this.requireSharedDatabase();
    this.transaction = await database.beginRollbackTransaction();
    const harness = new FrontendHttpIntegrationHarness({
      config: WorkflowDebugSessionIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        DATABASE_URL: database.databaseUrl,
      },
      bindings: [this.createPrismaClientBinding()],
    });
    await harness.start();
    this.harness = harness;
    return harness;
  }

  async dispose(): Promise<void> {
    if (this.harness) {
      await this.harness.close();
      this.harness = null;
    }
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
  }

  async closeSharedDatabase(): Promise<void> {
    if (!this.sharedDatabase) {
      return;
    }
    await this.sharedDatabase.close();
    this.sharedDatabase = null;
  }

  private createPrismaClientBinding(): CodemationBinding<unknown> {
    return {
      token: PrismaClient,
      useFactory: () => this.requireTransaction(),
    };
  }

  private requireSharedDatabase(): PostgresIntegrationDatabase {
    if (!this.sharedDatabase) {
      throw new Error("WorkflowDebugSessionIntegrationContext.prepareSharedDatabase() must be called before start().");
    }
    return this.sharedDatabase;
  }

  private requireTransaction(): PrismaClient {
    if (!this.transaction) {
      throw new Error("WorkflowDebugSessionIntegrationContext.start() must be called before resolving the Prisma client binding.");
    }
    return this.transaction.getPrismaClient();
  }
}

describe("workflow debug session http integration", () => {
  const context = new WorkflowDebugSessionIntegrationContext();

  beforeAll(async () => {
    await context.prepareSharedDatabase();
  });

  afterEach(async () => {
    await context.dispose();
  });

  afterAll(async () => {
    await context.closeSharedDatabase();
  });

  it("supports copy-to-live followed by stepwise reruns through node 3, 4, and 5", async () => {
    const harness = await context.start();

    const historicalRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
      },
    });
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, historicalRunResponse.runId);
    expect(historicalRun.nodeSnapshotsByNodeId.node_6?.status).toBe("completed");

    const copiedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "POST",
      url: ApiPaths.workflowDebuggerOverlayCopyRun(WorkflowDebugSessionIntegrationFixture.workflowId),
      payload: {
        sourceRunId: historicalRun.runId,
      },
    });
    expect(copiedOverlay.currentState.nodeSnapshotsByNodeId.node_6?.status).toBe("completed");

    const runToNode3 = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: copiedOverlay.currentState,
        clearFromNodeId: "node_3",
        stopAt: "node_3",
        mode: "manual",
      },
    });
    const runToNode3State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToNode3.runId);
    expect(runToNode3State.status).toBe("completed");
    expect(runToNode3State.nodeSnapshotsByNodeId.node_1?.status).toBe("completed");
    expect(runToNode3State.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(runToNode3State.nodeSnapshotsByNodeId.node_3?.status).toBe("completed");
    expect(runToNode3State.nodeSnapshotsByNodeId.node_4).toBeUndefined();
    expect(runToNode3State.nodeSnapshotsByNodeId.node_5).toBeUndefined();
    expect(runToNode3State.nodeSnapshotsByNodeId.node_6).toBeUndefined();

    const runToNode4 = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: {
          outputsByNode: runToNode3State.outputsByNode,
          nodeSnapshotsByNodeId: runToNode3State.nodeSnapshotsByNodeId,
          mutableState: runToNode3State.mutableState,
        },
        clearFromNodeId: "node_4",
        stopAt: "node_4",
        mode: "manual",
      },
    });
    const runToNode4State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToNode4.runId);
    expect(runToNode4State.status).toBe("completed");
    expect(runToNode4State.nodeSnapshotsByNodeId.node_4?.status).toBe("completed");
    expect(runToNode4State.nodeSnapshotsByNodeId.node_5).toBeUndefined();
    expect(runToNode4State.nodeSnapshotsByNodeId.node_6).toBeUndefined();

    const runToNode5 = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: {
          outputsByNode: runToNode4State.outputsByNode,
          nodeSnapshotsByNodeId: runToNode4State.nodeSnapshotsByNodeId,
          mutableState: runToNode4State.mutableState,
        },
        clearFromNodeId: "node_5",
        stopAt: "node_5",
        mode: "manual",
      },
    });
    const runToNode5State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToNode5.runId);
    expect(runToNode5State.status).toBe("completed");
    expect(runToNode5State.nodeSnapshotsByNodeId.node_5?.status).toBe("completed");
    expect(runToNode5State.nodeSnapshotsByNodeId.node_6).toBeUndefined();
  });

  it("stops at B for A -> B -> C -> D after copying a historical run into live", async () => {
    const harness = await context.start();

    const historicalRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
      },
    });
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, historicalRunResponse.runId);
    expect(historicalRun.nodeSnapshotsByNodeId.node_4?.status).toBe("completed");

    const copiedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "POST",
      url: ApiPaths.workflowDebuggerOverlayCopyRun(WorkflowDebugSessionIntegrationFixture.workflowId),
      payload: {
        sourceRunId: historicalRun.runId,
      },
    });

    const runToNode2 = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: copiedOverlay.currentState,
        clearFromNodeId: "node_2",
        stopAt: "node_2",
        mode: "manual",
      },
    });
    const runToNode2State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToNode2.runId);
    expect(runToNode2State.nodeSnapshotsByNodeId.node_1?.status).toBe("completed");
    expect(runToNode2State.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(runToNode2State.nodeSnapshotsByNodeId.node_3).toBeUndefined();
    expect(runToNode2State.nodeSnapshotsByNodeId.node_4).toBeUndefined();
  });
});
