// @vitest-environment node

import type { BinaryAttachment, PersistedRunState, RunSummary, WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OVERLAY_PIN_BINARY_RUN_ID } from "../../src/application/binary/OverlayPinnedBinaryUploadService";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { WorkflowDebuggerOverlayResponse } from "../../src/application/contracts/WorkflowDebuggerContracts";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import type { CodemationAppContext } from "../../src/presentation/config/CodemationAppContext";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationDatabaseFactory } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

class WorkflowRunsIntegrationFixture {
  static readonly workflowId = "wf.http.integration";
  static readonly triggerNodeId = "trigger";
  static readonly mapNodeId = "map_data";

  static async createHarness(
    options: Readonly<{ applyMigrations?: boolean }> = {},
  ): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; database: IntegrationDatabase }>> {
    const database =
      options.applyMigrations === false
        ? await IntegrationDatabaseFactory.createUnmigrated()
        : await IntegrationDatabaseFactory.create();
    const config = mergeIntegrationDatabaseRuntime(this.createConfig(), database);
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
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
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "HTTP integration workflow",
    })
      .trigger(new ManualTrigger("Manual trigger", this.triggerNodeId))
      .then(new MapData("Return payload", (item) => item.json, { id: this.mapNodeId }))
      .build();
  }

  static async waitForRunToComplete(
    harness: FrontendHttpIntegrationHarness,
    runId: string,
  ): Promise<PersistedRunState> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
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
  private readonly session = new IntegrationTestDatabaseSession();
  harness: FrontendHttpIntegrationHarness | null = null;
  database: IntegrationDatabase | null = null;
  transaction: PostgresRollbackTransaction | null = null;
  private ownsActiveDatabase = false;

  async prepareSharedDatabase(): Promise<void> {
    if (this.session.database) {
      return;
    }
    await this.session.start();
  }

  async start(options: Readonly<{ applyMigrations?: boolean }> = {}): Promise<FrontendHttpIntegrationHarness> {
    const fixture =
      options.applyMigrations === false
        ? await WorkflowRunsIntegrationFixture.createHarness(options)
        : await this.createSharedHarness();
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
    this.transaction = null;
    if (!this.ownsActiveDatabase && this.session.database) {
      await this.session.afterEach();
      this.transaction = this.session.transaction;
    }
    this.ownsActiveDatabase = false;
  }

  async closeSharedDatabase(): Promise<void> {
    await this.session.dispose();
  }

  private async createSharedHarness(): Promise<
    Readonly<{ harness: FrontendHttpIntegrationHarness; database: IntegrationDatabase }>
  > {
    const database = this.requireSharedDatabase();
    this.transaction = this.session.transaction;
    return await this.createHarnessFromDatabase(database, (context) => this.registerPrismaClient(context));
  }

  private async createHarnessFromDatabase(
    database: IntegrationDatabase,
    register?: (context: CodemationAppContext) => void,
  ): Promise<Readonly<{ harness: FrontendHttpIntegrationHarness; database: IntegrationDatabase }>> {
    const config = mergeIntegrationDatabaseRuntime(WorkflowRunsIntegrationFixture.createConfig(), database);
    const harness = new FrontendHttpIntegrationHarness({
      config,
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      register,
    });
    await harness.start();
    return {
      harness,
      database,
    };
  }

  private registerPrismaClient(context: CodemationAppContext): void {
    context.registerFactory(ApplicationTokens.PrismaClient, () => this.requireTransaction());
  }

  private requireSharedDatabase(): IntegrationDatabase {
    if (!this.session.database) {
      throw new Error("WorkflowRunsIntegrationContext.prepareSharedDatabase() must be called before start().");
    }
    return this.session.database;
  }

  private requireTransaction(): PrismaClient {
    if (!this.transaction) {
      throw new Error(
        "WorkflowRunsIntegrationContext.start() must create a transaction before resolving the Prisma client binding.",
      );
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
        items: [{}],
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
    expect(
      updatedOverlay.currentState.mutableState?.nodesById?.[WorkflowRunsIntegrationFixture.mapNodeId]
        ?.pinnedOutputsByPort?.main,
    ).toEqual(pinnedItems);

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
        items: [{}],
      },
    });
    const firstCompletedState = await WorkflowRunsIntegrationFixture.waitForRunToComplete(
      harness,
      firstRunResponse.runId,
    );
    expect(firstCompletedState.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.triggerNodeId]?.status).toBe(
      "completed",
    );
    expect(firstCompletedState.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.status).toBe(
      "completed",
    );

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

    expect(secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.triggerNodeId]?.status).toBe(
      "completed",
    );
    expect(secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.status).toBe(
      "completed",
    );
    expect(
      secondRunResponse.state?.nodeSnapshotsByNodeId[WorkflowRunsIntegrationFixture.mapNodeId]?.usedPinnedOutput,
    ).toBe(true);
    expect(secondRunResponse.state?.outputsByNode[WorkflowRunsIntegrationFixture.mapNodeId]?.main).toEqual(pinnedItems);
  });

  it("uploads an overlay pinned binary via multipart and serves bytes from the overlay content route", async () => {
    const harness = await context.start();

    const payload = "pin-doc-bytes";
    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode(payload)], "doc.bin", { type: "application/octet-stream" }));
    form.set("nodeId", WorkflowRunsIntegrationFixture.mapNodeId);
    form.set("itemIndex", "0");
    form.set("attachmentName", "doc");

    const uploadResponse = await harness.postFormData(
      ApiPaths.workflowDebuggerOverlayBinaryUpload(WorkflowRunsIntegrationFixture.workflowId),
      form,
    );
    expect(uploadResponse.statusCode).toBe(201);
    const { attachment } = uploadResponse.json<{ attachment: BinaryAttachment }>();
    expect(attachment.id.length).toBeGreaterThan(0);
    expect(attachment.workflowId).toBe(WorkflowRunsIntegrationFixture.workflowId);
    expect(attachment.nodeId).toBe(WorkflowRunsIntegrationFixture.mapNodeId);
    expect(attachment.runId).toBe(OVERLAY_PIN_BINARY_RUN_ID);

    const pinnedItems = [{ json: { pinned: true }, binary: { doc: attachment } }];
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

    const overlayAfterPut = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "GET",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowRunsIntegrationFixture.workflowId),
    });
    const pinnedMain =
      overlayAfterPut.currentState.mutableState?.nodesById?.[WorkflowRunsIntegrationFixture.mapNodeId]
        ?.pinnedOutputsByPort?.main;
    expect(pinnedMain).toBeDefined();
    expect(pinnedMain?.[0]?.json).toEqual({ pinned: true });
    expect(pinnedMain?.[0]?.binary?.doc?.id).toBe(attachment.id);
    expect(pinnedMain?.[0]?.binary?.doc?.mimeType).toBe("application/octet-stream");

    const contentResponse = await harness.request({
      method: "GET",
      url: ApiPaths.workflowOverlayBinaryContent(WorkflowRunsIntegrationFixture.workflowId, attachment.id),
    });
    expect(contentResponse.statusCode).toBe(200);
    expect(contentResponse.body).toBe(payload);
  });

  it("rejects overlay binary uploads without a file or node id", async () => {
    const harness = await context.start();

    const missingFile = new FormData();
    missingFile.set("nodeId", WorkflowRunsIntegrationFixture.mapNodeId);
    missingFile.set("itemIndex", "0");
    missingFile.set("attachmentName", "doc");
    const missingFileResponse = await harness.postFormData(
      ApiPaths.workflowDebuggerOverlayBinaryUpload(WorkflowRunsIntegrationFixture.workflowId),
      missingFile,
    );
    expect(missingFileResponse.statusCode).toBe(400);
    expect(missingFileResponse.json<{ error: string }>().error).toBe("file is required");

    const missingNode = new FormData();
    missingNode.set("file", new File([new Uint8Array([7])], "a.bin"));
    missingNode.set("itemIndex", "0");
    missingNode.set("attachmentName", "doc");
    const missingNodeResponse = await harness.postFormData(
      ApiPaths.workflowDebuggerOverlayBinaryUpload(WorkflowRunsIntegrationFixture.workflowId),
      missingNode,
    );
    expect(missingNodeResponse.statusCode).toBe(400);
    expect(missingNodeResponse.json<{ error: string }>().error).toBe("nodeId is required");
  });
});
