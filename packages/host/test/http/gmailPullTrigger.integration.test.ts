// @vitest-environment node

import type { CredentialSessionService, PersistedRunState } from "@codemation/core";
import { CoreTokens } from "@codemation/core";
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GmailNodes,
  GmailNodeTokens,
  OnNewGmailTrigger,
  type GmailApiClient,
  type GmailHistoryDelta,
  type GmailMessageAttachmentContent,
  type GmailMessageRecord,
  type GmailPulledNotification,
  type GmailWatchRegistration,
  type OnNewGmailTriggerItemJson,
} from "../../../core-nodes-gmail/src/index";
import type { RunCommandResult } from "../../src/application/contracts/RunContracts";
import type { WorkflowDebuggerOverlayResponse } from "../../src/application/contracts/WorkflowDebuggerContracts";
import type { CodemationBinding } from "../../src/presentation/config/CodemationBinding";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { IntegrationTestAuth } from "./testkit/IntegrationTestAuth";

class FakeGmailApiClient implements GmailApiClient {
  getDefaultGcpProjectIdForPubSub(): string | undefined {
    return undefined;
  }

  labels = [{ id: "IMPORTANT", name: "IMPORTANT" }] as const;
  messageIds: ReadonlyArray<string> = ["message_1"];
  watchRegistration: GmailWatchRegistration = {
    historyId: "history_1",
    expirationAt: "2026-03-18T12:00:00.000Z",
  };
  historyDelta: GmailHistoryDelta = {
    historyId: "history_2",
    messageIds: ["message_1"],
  };
  notifications: GmailPulledNotification[] = [];

  async ensureSubscription(): Promise<void> {}

  async pull(): Promise<ReadonlyArray<GmailPulledNotification>> {
    const notifications = [...this.notifications];
    this.notifications = [];
    return notifications;
  }

  async getCurrentHistoryId(): Promise<string> {
    return "history_1";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    return this.messageIds;
  }

  async listLabels() {
    return this.labels;
  }

  async watchMailbox(): Promise<GmailWatchRegistration> {
    return this.watchRegistration;
  }

  async listAddedMessageIds(): Promise<GmailHistoryDelta> {
    return this.historyDelta;
  }

  async getMessage(): Promise<GmailMessageRecord> {
    return {
      messageId: "message_1",
      labelIds: ["IMPORTANT"],
      headers: {
        Subject: "Quote request",
        From: "buyer@example.com",
      },
      snippet: "Need a quote",
      attachments: [],
    };
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "attachment_1",
      body: new TextEncoder().encode("attachment body"),
      mimeType: "text/plain",
      filename: "note.txt",
      size: 15,
    };
  }
}

class GmailIntegrationCredentialSessionService implements CredentialSessionService {
  constructor(private readonly apiClient: GmailApiClient) {}

  async getSession<TSession = unknown>(
    _: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>,
  ): Promise<TSession> {
    return this.apiClient as TSession;
  }
}

class FakePulledNotification implements GmailPulledNotification {
  acked = false;

  constructor(
    readonly notification: Readonly<{
      emailAddress: string;
      historyId: string;
      publishTime?: string;
    }>,
  ) {}

  async ack(): Promise<void> {
    this.acked = true;
  }
}

class GmailPullTriggerIntegrationFixture {
  static readonly workflowId = "wf.gmail.integration";
  static readonly triggerNodeId = "on_gmail";
  static readonly callbackNodeId = "capture_gmail_payload";

  static createWorkflow() {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Gmail pull integration workflow",
    })
      .trigger(
        new OnNewGmailTrigger(
          "On Gmail",
          {
            mailbox: "sales@example.com",
            topicName: "projects/project-id/topics/gmail",
            subscriptionName: "projects/project-id/subscriptions/gmail",
            labelIds: ["IMPORTANT"],
            query: "quote",
          },
          this.triggerNodeId,
        ),
      )
      .then(
        new Callback<OnNewGmailTriggerItemJson, Readonly<{ messageId: string; subject?: string }>>(
          "Capture Gmail payload",
          (items) =>
            items.map((item) => ({
              json: {
                messageId: item.json.messageId,
                subject: item.json.subject,
              },
            })),
          this.callbackNodeId,
        ),
      )
      .build();
  }

  static createConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      plugins: [new GmailNodes({ pullIntervalMs: 25 })],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: IntegrationTestAuth.developmentBypass,
    };
  }

  static createBindings(apiClient: GmailApiClient): ReadonlyArray<CodemationBinding<unknown>> {
    return [
      {
        token: CoreTokens.CredentialSessionService,
        useValue: new GmailIntegrationCredentialSessionService(apiClient),
      },
      {
        token: GmailNodeTokens.GmailApiClient,
        useValue: apiClient,
      },
    ];
  }

  static async waitForRun(harness: FrontendHttpIntegrationHarness): Promise<Readonly<{ runId: string }>> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.workflowRuns(this.workflowId),
      });
      const runs = response.json<Array<{ runId: string }>>();
      if (runs.length > 0) {
        return runs[0]!;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Expected the Gmail pull trigger to start a workflow run.");
  }

  static async waitForCompletedRunState(
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
        const runState = response.json<PersistedRunState>();
        if (runState.status === "completed") {
          return runState;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Expected run ${runId} to complete.`);
  }
}

describe("Gmail pull trigger integration", () => {
  const harnesses: FrontendHttpIntegrationHarness[] = [];

  afterEach(async () => {
    while (harnesses.length > 0) {
      await harnesses.pop()?.close();
    }
  });

  it("boots with new GmailNodes() and starts a run from a pulled Pub/Sub notification", async () => {
    const apiClient = new FakeGmailApiClient();
    const notification = new FakePulledNotification({
      emailAddress: "sales@example.com",
      historyId: "history_2",
      publishTime: "2026-03-17T12:05:00.000Z",
    });
    apiClient.notifications = [notification];
    const harness = new FrontendHttpIntegrationHarness({
      config: GmailPullTriggerIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      bindings: GmailPullTriggerIntegrationFixture.createBindings(apiClient),
    });
    harnesses.push(harness);
    await harness.start();

    const run = await GmailPullTriggerIntegrationFixture.waitForRun(harness);
    const runState = await GmailPullTriggerIntegrationFixture.waitForCompletedRunState(harness, run.runId);

    expect(runState.status).toBe("completed");
    expect(notification.acked).toBe(true);
  });

  it("synthesizes a Gmail test item through the runs api and allows pinning the trigger output", async () => {
    const apiClient = new FakeGmailApiClient();
    const harness = new FrontendHttpIntegrationHarness({
      config: GmailPullTriggerIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      bindings: GmailPullTriggerIntegrationFixture.createBindings(apiClient),
    });
    harnesses.push(harness);
    await harness.start();

    const runResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: GmailPullTriggerIntegrationFixture.workflowId,
        stopAt: GmailPullTriggerIntegrationFixture.triggerNodeId,
        mode: "manual",
        synthesizeTriggerItems: true,
      },
    });
    const runState = await GmailPullTriggerIntegrationFixture.waitForCompletedRunState(harness, runResponse.runId);
    const triggerOutputs = runState.outputsByNode[GmailPullTriggerIntegrationFixture.triggerNodeId]?.main;

    expect(runState.status).toBe("completed");
    expect(triggerOutputs).toEqual([
      {
        json: expect.objectContaining({
          mailbox: "sales@example.com",
          historyId: "history_1",
          messageId: "message_1",
          subject: "Quote request",
        }),
      },
    ]);
    expect(runState.nodeSnapshotsByNodeId[GmailPullTriggerIntegrationFixture.triggerNodeId]?.status).toBe("completed");
    expect(runState.nodeSnapshotsByNodeId[GmailPullTriggerIntegrationFixture.callbackNodeId]).toBeUndefined();

    const overlayState = await harness.requestJson<WorkflowDebuggerOverlayResponse>({
      method: "PUT",
      url: ApiPaths.workflowDebuggerOverlay(GmailPullTriggerIntegrationFixture.workflowId),
      payload: {
        currentState: {
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
          mutableState: {
            nodesById: {
              [GmailPullTriggerIntegrationFixture.triggerNodeId]: {
                pinnedOutputsByPort: {
                  main: triggerOutputs,
                },
              },
            },
          },
        },
      },
    });
    expect(
      overlayState.currentState.mutableState?.nodesById?.[GmailPullTriggerIntegrationFixture.triggerNodeId]
        ?.pinnedOutputsByPort?.main,
    ).toEqual(triggerOutputs);
  });

  it("synthesizes Gmail test items when Run workflow sends a cleared debugger currentState with synthesizeTriggerItems", async () => {
    const apiClient = new FakeGmailApiClient();
    const harness = new FrontendHttpIntegrationHarness({
      config: GmailPullTriggerIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      bindings: GmailPullTriggerIntegrationFixture.createBindings(apiClient),
    });
    harnesses.push(harness);
    await harness.start();

    const runResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: GmailPullTriggerIntegrationFixture.workflowId,
        mode: "manual",
        synthesizeTriggerItems: true,
        currentState: {
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
          mutableState: { nodesById: {} },
        },
      },
    });
    const runState = await GmailPullTriggerIntegrationFixture.waitForCompletedRunState(harness, runResponse.runId);

    expect(runState.status).toBe("completed");
    expect(runState.outputsByNode[GmailPullTriggerIntegrationFixture.triggerNodeId]?.main).toEqual([
      {
        json: expect.objectContaining({
          mailbox: "sales@example.com",
          messageId: "message_1",
          subject: "Quote request",
        }),
      },
    ]);
  });

  it("auto-synthesizes trigger test items when stopping at a trigger with an empty trigger payload", async () => {
    const apiClient = new FakeGmailApiClient();
    const harness = new FrontendHttpIntegrationHarness({
      config: GmailPullTriggerIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      bindings: GmailPullTriggerIntegrationFixture.createBindings(apiClient),
    });
    harnesses.push(harness);
    await harness.start();

    const runResponse = await harness.requestJson<RunCommandResult>({
      method: "POST",
      url: ApiPaths.runs(),
      payload: {
        workflowId: GmailPullTriggerIntegrationFixture.workflowId,
        items: [],
        stopAt: GmailPullTriggerIntegrationFixture.triggerNodeId,
        mode: "manual",
      },
    });
    const runState = await GmailPullTriggerIntegrationFixture.waitForCompletedRunState(harness, runResponse.runId);

    expect(runState.status).toBe("completed");
    expect(runState.outputsByNode[GmailPullTriggerIntegrationFixture.triggerNodeId]?.main).toEqual([
      {
        json: expect.objectContaining({
          mailbox: "sales@example.com",
          messageId: "message_1",
          subject: "Quote request",
        }),
      },
    ]);
  });
});
