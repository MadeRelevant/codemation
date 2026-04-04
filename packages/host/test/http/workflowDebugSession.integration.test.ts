// @vitest-environment node

import type { PersistedRunState, WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { WorkflowDebuggerOverlayResponse } from "../../src/application/contracts/WorkflowDebuggerContracts";
import type { WorkflowWebsocketMessage } from "../../src/application/contracts/WorkflowWebsocketMessage";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";
import type { CodemationAppContext } from "../../src/presentation/config/CodemationAppContext";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
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
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "HTTP debug session workflow",
    })
      .trigger(new ManualTrigger("Node 1", [{ json: {} }], this.nodeIds[0]))
      .then(new MapData("Node 2", (item) => item.json, this.nodeIds[1]))
      .then(new MapData("Node 3", (item) => item.json, this.nodeIds[2]))
      .then(new MapData("Node 4", (item) => item.json, this.nodeIds[3]))
      .then(new MapData("Node 5", (item) => item.json, this.nodeIds[4]))
      .then(new MapData("Node 6", (item) => item.json, this.nodeIds[5]))
      .build();
  }

  static async waitForRunToComplete(
    harness: FrontendHttpIntegrationHarness,
    runId: string,
    options?: Readonly<{ terminalNodeId?: string }>,
  ): Promise<PersistedRunState> {
    const deadline = performance.now() + 30_000;
    while (performance.now() < deadline) {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.runState(runId),
      });
      if (response.statusCode === 200) {
        const state = response.json<PersistedRunState>();
        if (state.status === "failed") {
          throw new Error(`Run ${runId} failed`);
        }
        if (state.status !== "completed") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        if (options?.terminalNodeId && state.nodeSnapshotsByNodeId[options.terminalNodeId]?.status !== "completed") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Run ${runId} did not complete before the timeout elapsed.`);
  }
}

class WorkflowDebugSessionIntegrationContext {
  private readonly session = new IntegrationTestDatabaseSession();
  harness: FrontendHttpIntegrationHarness | null = null;
  transaction: PostgresRollbackTransaction | null = null;

  async prepareSharedDatabase(): Promise<void> {
    if (this.session.database) {
      return;
    }
    await this.session.start();
  }

  async start(): Promise<FrontendHttpIntegrationHarness> {
    const database = this.requireSharedDatabase();
    this.transaction = this.session.transaction;
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(WorkflowDebugSessionIntegrationFixture.createConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      register: (context) => this.registerPrismaClient(context),
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
    this.transaction = null;
    await this.session.afterEach();
    this.transaction = this.session.transaction;
  }

  async closeSharedDatabase(): Promise<void> {
    await this.session.dispose();
  }

  private registerPrismaClient(context: CodemationAppContext): void {
    context.registerFactory(ApplicationTokens.PrismaClient, () => this.requireTransaction());
  }

  private requireSharedDatabase(): IntegrationDatabase {
    if (!this.session.database) {
      throw new Error("WorkflowDebugSessionIntegrationContext.prepareSharedDatabase() must be called before start().");
    }
    return this.session.database;
  }

  private requireTransaction(): PrismaClient {
    if (!this.transaction) {
      throw new Error(
        "WorkflowDebugSessionIntegrationContext.start() must be called before resolving the Prisma client binding.",
      );
    }
    return this.transaction.getPrismaClient();
  }
}

type CapturedWorkflowWebsocketMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; roomId: string }>
  | Readonly<{ kind: "unsubscribed"; roomId: string }>
  | Readonly<{ kind: "error"; message: string }>
  | WorkflowWebsocketMessage;
type CapturedWorkflowEventMessage = Extract<CapturedWorkflowWebsocketMessage, Readonly<{ kind: "event" }>>;

class WorkflowWebsocketCaptureClient {
  private readonly messages: CapturedWorkflowWebsocketMessage[] = [];
  private readonly socket: WebSocket;

  constructor(port: number) {
    this.socket = new WebSocket(`ws://127.0.0.1:${String(port)}${ApiPaths.workflowWebsocket()}`);
    this.socket.on("message", (rawData) => {
      this.messages.push(JSON.parse(rawData.toString("utf8")) as CapturedWorkflowWebsocketMessage);
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  subscribe(workflowId: string): void {
    this.socket.send(JSON.stringify({ kind: "subscribe", roomId: workflowId }));
  }

  async waitForSubscription(workflowId: string): Promise<void> {
    await this.waitForMessage((message) => WorkflowWebsocketCaptureClient.isSubscribedMessage(message, workflowId));
  }

  async waitForRunEventCount(runId: string, expectedCount: number): Promise<void> {
    await this.waitForMessage(() => this.getRunEvents(runId).length >= expectedCount);
  }

  getRunEvents(runId: string): ReadonlyArray<CapturedWorkflowEventMessage> {
    return this.messages.filter(
      (message): message is CapturedWorkflowEventMessage => message.kind === "event" && message.event.runId === runId,
    );
  }

  getLastCompletedRunSavedState(runId: string): PersistedRunState | undefined {
    const runEvents = [...this.getRunEvents(runId)].reverse();
    const completedRunSaved = runEvents.find(
      (message) => message.event.kind === "runSaved" && message.event.state.status === "completed",
    );
    return completedRunSaved?.event.kind === "runSaved" ? completedRunSaved.event.state : undefined;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }

  private async waitForMessage(
    predicate: (message: CapturedWorkflowWebsocketMessage | undefined) => boolean,
  ): Promise<void> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const latestMessage = this.messages.at(-1);
      if (predicate(latestMessage)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Expected websocket message was not observed before timeout.");
  }

  private static isSubscribedMessage(
    message: CapturedWorkflowWebsocketMessage | undefined,
    workflowId: string,
  ): message is Extract<CapturedWorkflowWebsocketMessage, Readonly<{ kind: "subscribed"; roomId: string }>> {
    return message?.kind === "subscribed" && message.roomId === workflowId;
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

  it("copy-to-live preserves outputs and snapshots for multiple linear nodes (workflow definition ids)", async () => {
    const harness = await context.start();

    const historicalRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
      },
    });
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      historicalRunResponse.runId,
      {
        terminalNodeId: "node_6",
      },
    );
    expect(historicalRun.outputsByNode.node_2?.main?.length).toBeGreaterThan(0);
    expect(historicalRun.outputsByNode.node_3?.main?.length).toBeGreaterThan(0);
    expect(historicalRun.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(historicalRun.nodeSnapshotsByNodeId.node_3?.status).toBe("completed");

    const copiedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "POST",
      url: ApiPaths.workflowDebuggerOverlayCopyRun(WorkflowDebugSessionIntegrationFixture.workflowId),
      payload: {
        sourceRunId: historicalRun.runId,
      },
    });

    expect(copiedOverlay.currentState.outputsByNode.node_2?.main).toEqual(historicalRun.outputsByNode.node_2?.main);
    expect(copiedOverlay.currentState.outputsByNode.node_3?.main).toEqual(historicalRun.outputsByNode.node_3?.main);
    expect(copiedOverlay.currentState.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(copiedOverlay.currentState.nodeSnapshotsByNodeId.node_3?.status).toBe("completed");
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
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      historicalRunResponse.runId,
      {
        terminalNodeId: "node_6",
      },
    );
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
    const runToNode3State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      runToNode3.runId,
      { terminalNodeId: "node_3" },
    );
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
    const runToNode4State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      runToNode4.runId,
      { terminalNodeId: "node_4" },
    );
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
    const runToNode5State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      runToNode5.runId,
      { terminalNodeId: "node_5" },
    );
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
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      historicalRunResponse.runId,
      {
        terminalNodeId: "node_6",
      },
    );
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
    const runToNode2State = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      runToNode2.runId,
      { terminalNodeId: "node_2" },
    );
    expect(runToNode2State.nodeSnapshotsByNodeId.node_1?.status).toBe("completed");
    expect(runToNode2State.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(runToNode2State.nodeSnapshotsByNodeId.node_3).toBeUndefined();
    expect(runToNode2State.nodeSnapshotsByNodeId.node_4).toBeUndefined();
  });

  it("stopping at the manual trigger keeps downstream pins but excludes them from execution snapshots", async () => {
    const harness = await context.start();

    const historicalRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
      },
    });
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      historicalRunResponse.runId,
      {
        terminalNodeId: "node_6",
      },
    );
    expect(historicalRun.nodeSnapshotsByNodeId.node_6?.status).toBe("completed");

    const updatedOverlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "PUT",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowDebugSessionIntegrationFixture.workflowId),
      payload: {
        currentState: {
          outputsByNode: historicalRun.outputsByNode,
          nodeSnapshotsByNodeId: historicalRun.nodeSnapshotsByNodeId,
          mutableState: {
            nodesById: {
              node_2: {
                pinnedOutputsByPort: historicalRun.outputsByNode.node_2,
              },
              node_4: {
                pinnedOutputsByPort: historicalRun.outputsByNode.node_4,
              },
            },
          },
        },
      },
    });

    const runToTriggerResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: updatedOverlay.currentState,
        clearFromNodeId: "node_1",
        stopAt: "node_1",
        mode: "manual",
      },
    });
    const runToTriggerState = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      runToTriggerResponse.runId,
      {
        terminalNodeId: "node_1",
      },
    );

    expect(runToTriggerState.status).toBe("completed");
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_1?.status).toBe("completed");
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_2).toBeUndefined();
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_3).toBeUndefined();
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_4).toBeUndefined();
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_5).toBeUndefined();
    expect(runToTriggerState.nodeSnapshotsByNodeId.node_6).toBeUndefined();
    expect(runToTriggerState.mutableState?.nodesById?.node_2?.pinnedOutputsByPort?.main).toEqual(
      historicalRun.outputsByNode.node_2?.main,
    );
    expect(runToTriggerState.mutableState?.nodesById?.node_4?.pinnedOutputsByPort?.main).toEqual(
      historicalRun.outputsByNode.node_4?.main,
    );
    expect(runToTriggerState.outputsByNode.node_2?.main).toEqual(historicalRun.outputsByNode.node_2?.main);
    expect(runToTriggerState.outputsByNode.node_4?.main).toEqual(historicalRun.outputsByNode.node_4?.main);
  });

  it("emits the full websocket lifecycle when rerunning from A and then to C with B pinned", async () => {
    const harness = await context.start();
    const websocket = new WorkflowWebsocketCaptureClient(harness.getWorkflowWebsocketPort());
    await websocket.open();
    websocket.subscribe(WorkflowDebugSessionIntegrationFixture.workflowId);
    await websocket.waitForSubscription(WorkflowDebugSessionIntegrationFixture.workflowId);

    const historicalRunResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
      },
    });
    const historicalRun = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(
      harness,
      historicalRunResponse.runId,
      {
        terminalNodeId: "node_6",
      },
    );

    const overlay = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "PUT",
      url: ApiPaths.workflowDebuggerOverlay(WorkflowDebugSessionIntegrationFixture.workflowId),
      payload: {
        currentState: {
          outputsByNode: historicalRun.outputsByNode,
          nodeSnapshotsByNodeId: historicalRun.nodeSnapshotsByNodeId,
          mutableState: {
            nodesById: {
              node_2: {
                pinnedOutputsByPort: historicalRun.outputsByNode.node_2,
              },
            },
          },
        },
      },
    });

    const runToA = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: overlay.currentState,
        clearFromNodeId: "node_1",
        stopAt: "node_1",
        mode: "manual",
      },
    });
    const runToAState = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToA.runId, {
      terminalNodeId: "node_1",
    });
    await websocket.waitForRunEventCount(runToA.runId, 7);

    const runToC = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: WorkflowDebugSessionIntegrationFixture.workflowId,
        currentState: {
          outputsByNode: runToAState.outputsByNode,
          nodeSnapshotsByNodeId: runToAState.nodeSnapshotsByNodeId,
          mutableState: runToAState.mutableState,
        },
        clearFromNodeId: "node_3",
        stopAt: "node_3",
        mode: "manual",
      },
    });
    const runToCState = await WorkflowDebugSessionIntegrationFixture.waitForRunToComplete(harness, runToC.runId, {
      terminalNodeId: "node_3",
    });
    await websocket.waitForRunEventCount(runToC.runId, 7);

    const runToAEvents = websocket.getRunEvents(runToA.runId);
    expect(runToAEvents.map((message) => message.event.kind)).toEqual([
      "runCreated",
      "runSaved",
      "nodeQueued",
      "runSaved",
      "nodeStarted",
      "runSaved",
      "nodeCompleted",
    ]);

    const runToCEvents = websocket.getRunEvents(runToC.runId);
    expect(runToCEvents.map((message) => message.event.kind)).toEqual([
      "runCreated",
      "runSaved",
      "nodeQueued",
      "runSaved",
      "nodeStarted",
      "runSaved",
      "nodeCompleted",
    ]);

    const completedRunSavedState = websocket.getLastCompletedRunSavedState(runToC.runId);
    expect(completedRunSavedState?.nodeSnapshotsByNodeId.node_1?.status).toBe("completed");
    expect(completedRunSavedState?.nodeSnapshotsByNodeId.node_2?.status).toBe("completed");
    expect(completedRunSavedState?.nodeSnapshotsByNodeId.node_2?.usedPinnedOutput).toBe(true);
    expect(completedRunSavedState?.nodeSnapshotsByNodeId.node_3?.status).toBe("completed");
    expect(runToCState.nodeSnapshotsByNodeId.node_2?.usedPinnedOutput).toBe(true);

    await websocket.close();
  }, 60_000);
});
