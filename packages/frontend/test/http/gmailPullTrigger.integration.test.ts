// @vitest-environment node

import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodemationBinding } from "../../src/presentation/config/CodemationBinding";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import {
  GmailNodes,
  GmailNodeTokens,
  OnNewGmailTrigger,
  type GmailApiClient,
  type GmailHistoryDelta,
  type GmailMessageRecord,
  type GmailPubSubPullClient,
  type GmailPulledNotification,
  type GmailServiceAccountCredential,
  type GmailWatchRegistration,
  type OnNewGmailTriggerItemJson,
} from "../../../core-nodes-gmail/src/index.ts";
import { Callback, createWorkflowBuilder } from "@codemation/core-nodes";

class FakeGmailApiClient implements GmailApiClient {
  watchRegistration: GmailWatchRegistration = {
    historyId: "history_1",
    expirationAt: "2026-03-18T12:00:00.000Z",
  };
  historyDelta: GmailHistoryDelta = {
    historyId: "history_2",
    messageIds: ["message_1"],
  };

  async getCurrentHistoryId(): Promise<string> {
    return "history_1";
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
    };
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

class FakeGmailPubSubPullClient implements GmailPubSubPullClient {
  notifications: GmailPulledNotification[] = [];

  async ensureSubscription(): Promise<void> {}

  async pull(): Promise<ReadonlyArray<GmailPulledNotification>> {
    const notifications = [...this.notifications];
    this.notifications = [];
    return notifications;
  }
}

class GmailPullTriggerIntegrationFixture {
  static readonly workflowId = "wf.gmail.integration";
  static readonly credential: GmailServiceAccountCredential = {
    clientEmail: "gmail@test.dev",
    privateKey: "private-key",
    projectId: "project-id",
  };

  static createWorkflow() {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Gmail pull integration workflow",
    })
      .trigger(
        new OnNewGmailTrigger("On Gmail", {
          credential: this.credential,
          mailbox: "sales@example.com",
          topicName: "projects/project-id/topics/gmail",
          subscriptionName: "projects/project-id/subscriptions/gmail",
          labelIds: ["IMPORTANT"],
          query: "quote",
        }),
      )
      .then(
        new Callback<OnNewGmailTriggerItemJson, Readonly<{ messageId: string; subject?: string }>>("Capture Gmail payload", (items) =>
          items.map((item) => ({
            json: {
              messageId: item.json.messageId,
              subject: item.json.subject,
            },
          })),
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
    };
  }

  static createBindings(apiClient: GmailApiClient, pullClient: GmailPubSubPullClient): ReadonlyArray<CodemationBinding<unknown>> {
    return [
      {
        token: GmailNodeTokens.GmailApiClient,
        useValue: apiClient,
      },
      {
        token: GmailNodeTokens.GmailPubSubPullClient,
        useValue: pullClient,
      },
    ];
  }

  static async waitForRun(harness: FrontendHttpIntegrationHarness): Promise<Readonly<{ runId: string }>> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
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
  ): Promise<Readonly<{ status: string; outputsByNode: Record<string, unknown> }>> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const response = await harness.request({
        method: "GET",
        url: ApiPaths.runState(runId),
      });
      if (response.statusCode === 200) {
        const runState = response.json<{ status: string; outputsByNode: Record<string, unknown> }>();
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
    const pullClient = new FakeGmailPubSubPullClient();
    pullClient.notifications = [notification];
    const harness = new FrontendHttpIntegrationHarness({
      config: GmailPullTriggerIntegrationFixture.createConfig(),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      bindings: GmailPullTriggerIntegrationFixture.createBindings(apiClient, pullClient),
    });
    harnesses.push(harness);
    await harness.start();

    const run = await GmailPullTriggerIntegrationFixture.waitForRun(harness);
    const runState = await GmailPullTriggerIntegrationFixture.waitForCompletedRunState(harness, run.runId);

    expect(runState.status).toBe("completed");
    expect(notification.acked).toBe(true);
  });
});
