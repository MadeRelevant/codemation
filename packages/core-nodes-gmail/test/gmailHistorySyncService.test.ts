import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryCredentialService } from "@codemation/core";
import { GmailHistoryGapError, type GmailApiClient, type GmailHistoryDelta, type GmailMessageRecord, type GmailWatchRegistration } from "../src/services/GmailApiClient";
import { GmailHistorySyncService } from "../src/services/GmailHistorySyncService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailWatchService } from "../src/services/GmailWatchService";
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
  historyDelta: GmailHistoryDelta = {
    historyId: "history_2",
    messageIds: ["msg_1", "msg_2", "msg_1"],
  };
  messagesById = new Map<string, GmailMessageRecord>();
  baselineHistoryId = "history_1";
  watchRegistration: GmailWatchRegistration = {
    historyId: "history_1",
    expirationAt: "2026-03-18T12:00:00.000Z",
  };
  throwHistoryGap = false;

  async getCurrentHistoryId(): Promise<string> {
    return this.baselineHistoryId;
  }

  async watchMailbox(): Promise<GmailWatchRegistration> {
    return this.watchRegistration;
  }

  async listAddedMessageIds(): Promise<GmailHistoryDelta> {
    if (this.throwHistoryGap) {
      throw new GmailHistoryGapError();
    }
    return this.historyDelta;
  }

  async getMessage(args: Readonly<{ messageId: string }>): Promise<GmailMessageRecord> {
    const message = this.messagesById.get(args.messageId);
    if (!message) {
      throw new Error(`Unknown message ${args.messageId}`);
    }
    return message;
  }
}

class GmailHistorySyncFixture {
  static readonly credential: GmailServiceAccountCredential = {
    clientEmail: "gmail@test.dev",
    privateKey: "private-key",
    projectId: "project-id",
  };
  static readonly trigger = {
    workflowId: "wf.gmail",
    nodeId: "trigger",
  } as const;

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
}

test("GmailHistorySyncService filters, deduplicates, and persists the next history cursor", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  gmailApiClient.messagesById.set("msg_1", {
    messageId: "msg_1",
    labelIds: ["IMPORTANT"],
    headers: {
      Subject: "Quote request",
      From: "buyer@example.com",
    },
    snippet: "Need a new quote",
  });
  gmailApiClient.messagesById.set("msg_2", {
    messageId: "msg_2",
    labelIds: ["OTHER"],
    headers: {
      Subject: "Ignore",
      From: "sender@example.com",
    },
    snippet: "not relevant",
  });
  const store = new InMemoryTriggerSetupStateStore();
  await store.save({
    trigger: GmailHistorySyncFixture.trigger,
    updatedAt: "2026-03-17T12:00:00.000Z",
    state: {
      mailbox: "sales@example.com",
      topicName: "projects/project-id/topics/gmail",
      subscriptionName: "projects/project-id/subscriptions/gmail",
      historyId: "history_1",
      watchExpiration: "2026-03-18T12:00:00.000Z",
    },
  });
  const watchService = new GmailWatchService(gmailApiClient, store as never);
  const service = new GmailHistorySyncService(
    gmailApiClient,
    store as never,
    watchService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );

  const items = await service.sync({
    trigger: GmailHistorySyncFixture.trigger,
    config: GmailHistorySyncFixture.createConfig(),
    notification: {
      emailAddress: "sales@example.com",
      historyId: "history_2",
      publishTime: "2026-03-17T12:05:00.000Z",
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.json.messageId, "msg_1");
  assert.deepEqual((await store.load(GmailHistorySyncFixture.trigger))?.state.historyId, "history_2");
});

test("GmailHistorySyncService re-baselines after a Gmail history gap", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  gmailApiClient.throwHistoryGap = true;
  gmailApiClient.baselineHistoryId = "history_99";
  const store = new InMemoryTriggerSetupStateStore();
  const watchService = new GmailWatchService(gmailApiClient, store as never);
  const service = new GmailHistorySyncService(
    gmailApiClient,
    store as never,
    watchService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );

  const items = await service.sync({
    trigger: GmailHistorySyncFixture.trigger,
    config: GmailHistorySyncFixture.createConfig(),
    notification: {
      emailAddress: "sales@example.com",
      historyId: "history_100",
    },
  });

  assert.deepEqual(items, []);
  assert.deepEqual((await store.load(GmailHistorySyncFixture.trigger))?.state.historyId, "history_99");
});
