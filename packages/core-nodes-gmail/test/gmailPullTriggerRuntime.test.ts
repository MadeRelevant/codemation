import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryCredentialService } from "@codemation/core";
import { GmailHistorySyncService } from "../src/services/GmailHistorySyncService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailWatchService } from "../src/services/GmailWatchService";
import { GmailPullTriggerRuntime } from "../src/runtime/GmailPullTriggerRuntime";
import type { GmailApiClient, GmailHistoryDelta, GmailMessageRecord, GmailWatchRegistration } from "../src/services/GmailApiClient";
import type { GmailPubSubPullClient, GmailPulledNotification } from "../src/services/GmailPubSubPullClient";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import type { GmailServiceAccountCredential } from "../src/contracts/GmailServiceAccountCredential";

class InMemoryTriggerSetupStateStore {
  private readonly statesByKey = new Map<string, any>();

  async load(trigger: { workflowId: string; nodeId: string }) {
    return this.statesByKey.get(`${trigger.workflowId}:${trigger.nodeId}`);
  }

  async save(state: any): Promise<void> {
    this.statesByKey.set(`${state.trigger.workflowId}:${state.trigger.nodeId}`, state);
  }

  async delete(trigger: { workflowId: string; nodeId: string }): Promise<void> {
    this.statesByKey.delete(`${trigger.workflowId}:${trigger.nodeId}`);
  }
}

class FakeGmailApiClient implements GmailApiClient {
  watchRegistration: GmailWatchRegistration = {
    historyId: "history_1",
    expirationAt: "2026-03-18T12:00:00.000Z",
  };
  historyDelta: GmailHistoryDelta = {
    historyId: "history_2",
    messageIds: ["message_1"],
  };
  message: GmailMessageRecord = {
    messageId: "message_1",
    labelIds: ["IMPORTANT"],
    headers: {
      Subject: "Quote request",
      From: "buyer@example.com",
    },
    snippet: "Need a quote",
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
    return this.message;
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
  ensured = false;
  notifications: GmailPulledNotification[] = [];

  async ensureSubscription(): Promise<void> {
    this.ensured = true;
  }

  async pull(): Promise<ReadonlyArray<GmailPulledNotification>> {
    const notifications = [...this.notifications];
    this.notifications = [];
    return notifications;
  }
}

class NoopGmailLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class GmailPullTriggerRuntimeFixture {
  static readonly credential: GmailServiceAccountCredential = {
    clientEmail: "gmail@test.dev",
    privateKey: "private-key",
    projectId: "project-id",
  };

  static createConfig(): OnNewGmailTrigger {
    return new OnNewGmailTrigger("On Gmail", {
      credential: this.credential,
      mailbox: "sales@example.com",
      topicName: "projects/project-id/topics/gmail",
      subscriptionName: "projects/project-id/subscriptions/gmail",
      labelIds: ["IMPORTANT"],
      query: "quote",
    });
  }

  static async waitFor(assertion: () => void): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      try {
        assertion();
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assertion();
  }
}

test("GmailPullTriggerRuntime renews the watch, pulls notifications, emits items, and acknowledges messages", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  const pullClient = new FakeGmailPubSubPullClient();
  const notification = new FakePulledNotification({
    emailAddress: "sales@example.com",
    historyId: "history_2",
    publishTime: "2026-03-17T12:05:00.000Z",
  });
  pullClient.notifications = [notification];
  const store = new InMemoryTriggerSetupStateStore();
  const watchService = new GmailWatchService(gmailApiClient, store as never);
  const historySyncService = new GmailHistorySyncService(
    gmailApiClient,
    store as never,
    watchService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );
  const emittedPayloads: Array<ReadonlyArray<unknown>> = [];
  const runtime = new GmailPullTriggerRuntime(
    pullClient,
    {
      pullIntervalMs: 25,
      maxMessagesPerPull: 5,
    },
    new InMemoryCredentialService(),
    store as never,
    new NoopGmailLogger(),
    watchService,
    historySyncService,
  );

  const initialState = await runtime.ensureStarted({
    trigger: {
      workflowId: "wf.gmail",
      nodeId: "trigger",
    },
    config: GmailPullTriggerRuntimeFixture.createConfig(),
    previousState: undefined,
    emit: async (items) => {
      emittedPayloads.push(items);
    },
  });

  await GmailPullTriggerRuntimeFixture.waitFor(() => {
    assert.equal(pullClient.ensured, true);
    assert.equal(emittedPayloads.length, 1);
    assert.equal(notification.acked, true);
  });

  assert.equal(initialState?.historyId, "history_1");
  assert.equal(emittedPayloads[0]?.[0] && typeof emittedPayloads[0][0], "object");
});
