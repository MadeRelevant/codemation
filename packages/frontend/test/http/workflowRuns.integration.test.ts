// @vitest-environment node

import path from "node:path";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import type { PersistedRunState, RunSummary, WorkflowDefinition } from "@codemation/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { WorkflowDebuggerOverlayResponse } from "../../src/application/contracts/WorkflowDebuggerContracts";
import type { CodemationBinding } from "../../src/presentation/config/CodemationBinding";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { PrismaClient } from "../../src/infrastructure/persistence/generated/prisma-client/client.js";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { PostgresIntegrationDatabase } from "./testkit/PostgresIntegrationDatabase";
import { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

class WorkflowRunsIntegrationFixture {
  static readonly workflowId = "wf.http.integration";
  static readonly triggerNodeId = "trigger";
  static readonly mapNodeId = "map_data";

  static async createHarness(
    options: Readonly<{ applyMigrations?: boolean }> = {},
  ): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; database: PostgresIntegrationDatabase }>> {
    const database = options.applyMigrations === false ? await PostgresIntegrationDatabase.createUnmigrated() : await PostgresIntegrationDatabase.create();
    const config = this.createConfig();
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        DATABASE_URL: database.databaseUrl,
      },
    });
    await harness.start();
    return {
      harness,
      database,
    };
  }

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
      name: "HTTP integration workflow",
    })
      .trigger(new ManualTrigger("Manual trigger", this.triggerNodeId))
      .then(new MapData("Return payload", (item) => item.json, this.mapNodeId))
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
      await this.delay(100);
    }
    throw new Error(`Run ${runId} did not complete before the timeout elapsed.`);
  }

  private static async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class WorkflowRunsIntegrationContext {
  sharedDatabase: PostgresIntegrationDatabase | null = null;
  harness: FrontendHttpIntegrationHarness | null = null;
  database: PostgresIntegrationDatabase | null = null;
  transaction: PostgresRollbackTransaction | null = null;
  private ownsActiveDatabase = false;

  async prepareSharedDatabase(): Promise<void> {
    if (this.sharedDatabase) {
      return;
    }
    this.sharedDatabase = await PostgresIntegrationDatabase.create();
  }

  async start(options: Readonly<{ applyMigrations?: boolean }> = {}): Promise<FrontendHttpIntegrationHarness> {
    const fixture = options.applyMigrations === false ? await WorkflowRunsIntegrationFixture.createHarness(options) : await this.createSharedHarness();
    this.harness = fixture.harness;
    this.database = fixture.database;
    this.ownsActiveDatabase = options.applyMigrations === false;
    return fixture.harness;
  }

  async dispose(): Promise<void> {
    if (this.harness) {
      await this.harness.close();
      this.harness = null;
    }
    if (this.database) {
      if (this.ownsActiveDatabase) {
        await this.database.close();
      }
      this.database = null;
    }
    if (this.transaction) {
      await this.transaction.rollback();
      this.transaction = null;
    }
    this.ownsActiveDatabase = false;
  }

  async closeSharedDatabase(): Promise<void> {
    if (!this.sharedDatabase) {
      return;
    }
    await this.sharedDatabase.close();
    this.sharedDatabase = null;
  }

  private async createSharedHarness(): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; database: PostgresIntegrationDatabase }>> {
    const database = this.requireSharedDatabase();
    this.transaction = await database.beginRollbackTransaction();
    return await this.createHarnessFromDatabase(database, [this.createPrismaClientBinding()]);
  }

  private async createHarnessFromDatabase(
    database: PostgresIntegrationDatabase,
    bindings: ReadonlyArray<CodemationBinding<unknown>> = [],
  ): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; database: PostgresIntegrationDatabase }>> {
    const config = WorkflowRunsIntegrationFixture.createConfig();
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        DATABASE_URL: database.databaseUrl,
      },
      bindings,
    });
    await harness.start();
    return {
      harness,
      database,
    };
  }

  private createPrismaClientBinding(): CodemationBinding<unknown> {
    return {
      token: PrismaClient,
      useFactory: () => this.requireTransaction(),
    };
  }

  private requireSharedDatabase(): PostgresIntegrationDatabase {
    if (!this.sharedDatabase) {
      throw new Error("WorkflowRunsIntegrationContext.prepareSharedDatabase() must be called before start().");
    }
    return this.sharedDatabase;
  }

  private requireTransaction(): PrismaClient {
    if (!this.transaction) {
      throw new Error("WorkflowRunsIntegrationContext.start() must create a transaction before resolving the Prisma client binding.");
    }
    return this.transaction.getPrismaClient();
  }
}

describe("workflow runs http integration", () => {
  const context = new WorkflowRunsIntegrationContext();

  beforeAll(async () => {
    await context.prepareSharedDatabase();
  });

  afterEach(async () => {
    await context.dispose();
  });

  afterAll(async () => {
    await context.closeSharedDatabase();
  });

  it("returns an empty list for a workflow with no runs", async () => {
    const harness = await context.start();

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(WorkflowRunsIntegrationFixture.workflowId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReadonlyArray<RunSummary>>()).toEqual([]);
  });

  it("runs Prisma migrations during startup for an empty PostgreSQL database", async () => {
    const harness = await context.start({
      applyMigrations: false,
    });

    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(WorkflowRunsIntegrationFixture.workflowId),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<ReadonlyArray<RunSummary>>()).toEqual([]);
  });

  it("lists a newly created run through the http api", async () => {
    const harness = await context.start();

    const createRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      },
    });
    const runsResponse = await harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(WorkflowRunsIntegrationFixture.workflowId),
    });

    expect(createRunResponse.workflowId).toBe(WorkflowRunsIntegrationFixture.workflowId);
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json<ReadonlyArray<RunSummary>>()).toEqual([
      expect.objectContaining({
        runId: createRunResponse.runId,
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      }),
    ]);
    const completedState = await WorkflowRunsIntegrationFixture.waitForRunToComplete(harness, createRunResponse.runId);
    expect(completedState).toEqual(
      expect.objectContaining({
        runId: createRunResponse.runId,
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      }),
    );
  });

  it("accepts a single json object as run items", async () => {
    const harness = await context.start();

    const createRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
        items: {
          orderId: "ord_1",
        },
      } as object,
    });
    const completedState = await WorkflowRunsIntegrationFixture.waitForRunToComplete(harness, createRunResponse.runId);

    expect(completedState.outputsByNode[WorkflowRunsIntegrationFixture.mapNodeId]?.main).toEqual([
      {
        json: {
          orderId: "ord_1",
        },
      },
    ]);
  });

  it("persists workflow debugger overlay updates and copy-to-debugger through the http api", async () => {
    const harness = await context.start();

    const createRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
        mode: "debug",
      },
    });
    const completedState = await WorkflowRunsIntegrationFixture.waitForRunToComplete(harness, createRunResponse.runId);
    expect(completedState.executionOptions?.mode).toBe("debug");

    const pinnedItems = [{ json: { message: "pinned input" } }];
    const updatedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "PUT",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowRunsIntegrationFixture.workflowId),
      payload: {
        currentState: {
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
          mutableState: {
            nodesById: {
              [WorkflowRunsIntegrationFixture.mapNodeId]: {
                pinnedOutputsByPort: {
                  main: pinnedItems,
                },
              },
            },
          },
        },
      },
    });
    expect(updatedOverlay.currentState.mutableState?.nodesById?.[WorkflowRunsIntegrationFixture.mapNodeId]?.pinnedOutputsByPort?.main).toEqual(pinnedItems);

    const persistedOverlayResponse = await harness.request({
      method: "GET",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowRunsIntegrationFixture.workflowId),
    });
    expect(persistedOverlayResponse.statusCode).toBe(200);
    expect(
      persistedOverlayResponse.json<WorkflowDebuggerOverlayResponse>().currentState.mutableState?.nodesById?.[
        WorkflowRunsIntegrationFixture.mapNodeId
      ]?.pinnedOutputsByPort?.main,
    ).toEqual(pinnedItems);

    const copiedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "POST",
      url: ApiPaths.workflowDebuggerOverlayCopyRun(WorkflowRunsIntegrationFixture.workflowId),
      payload: {
        sourceRunId: createRunResponse.runId,
      },
    });
    expect(copiedOverlay.copiedFromRunId).toBe(createRunResponse.runId);
    expect(copiedOverlay.currentState.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]).toBeDefined();
  });

  it("reuses a persisted source run while overlay pins remain backend-owned", async () => {
    const harness = await context.start();

    const firstRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
      },
    });
    const firstCompletedState = await WorkflowRunsIntegrationFixture.waitForRunToComplete(harness, firstRunResponse.runId);
    expect(firstCompletedState.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.triggerNodeId]?.status).toBe("completed");
    expect(firstCompletedState.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.status).toBe("completed");

    const pinnedItems = [{ json: { reused: true } }];
    await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "PUT",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowRunsIntegrationFixture.workflowId),
      payload: {
        currentState: {
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
          mutableState: {
            nodesById: {
              [WorkflowRunsIntegrationFixture.mapNodeId]: {
                pinnedOutputsByPort: {
                  main: pinnedItems,
                },
              },
            },
          },
        },
      },
    });

    const secondRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowRunsIntegrationFixture.workflowId,
        sourceRunId: firstRunResponse.runId,
        clearFromNodeId: WorkflowRunsIntegrationFixture.mapNodeId,
        stopAt: WorkflowRunsIntegrationFixture.mapNodeId,
        mode: "manual",
      },
    });

    expect(secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.triggerNodeId]?.status).toBe("completed");
    expect(secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.status).toBe("completed");
    expect(secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.usedPinnedOutput).toBe(true);
    expect(secondRunResponse.state?.outputsByNode[WorkflowRunsIntegrationFixture.mapNodeId]?.main).toEqual(pinnedItems);
  });
});
