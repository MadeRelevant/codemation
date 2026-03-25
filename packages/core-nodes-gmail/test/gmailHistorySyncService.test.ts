import assert from "node:assert/strict";
import { test } from "vitest";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import {
  GmailHistoryGapError,
  type GmailApiClient,
  type GmailHistoryDelta,
  type GmailMessageAttachmentContent,
  type GmailMessageRecord,
  type GmailWatchRegistration,
} from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailHistorySyncService } from "../src/services/GmailHistorySyncService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import type { GmailPulledNotification } from "../src/services/GmailPubSubPullClient";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailWatchService } from "../src/services/GmailWatchService";

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
  labels = [
    { id: "IMPORTANT", name: "IMPORTANT" },
    { id: "Label_demo", name: "Demo" },
    { id: "OTHER", name: "Other" },
  ] as const;
  historyDelta: GmailHistoryDelta = {
    historyId: "history_2",
    messageIds: ["msg_1", "msg_2", "msg_1"],
  };
  messageIds: ReadonlyArray<string> = ["msg_1"];
  messagesById = new Map<string, GmailMessageRecord>();
  baselineHistoryId = "history_1";
  watchRegistration: GmailWatchRegistration = {
    historyId: "history_1",
    expirationAt: "2026-03-18T12:00:00.000Z",
  };
  throwHistoryGap = false;

  async ensureSubscription(): Promise<void> {}

  async pull(): Promise<ReadonlyArray<GmailPulledNotification>> {
    return [];
  }

  async getCurrentHistoryId(): Promise<string> {
    return this.baselineHistoryId;
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

class GmailHistorySyncFixture {
  static readonly trigger = {
    workflowId: "wf.gmail",
    nodeId: "trigger",
  } as const;

  static createConfig(): OnNewGmailTrigger {
    return new OnNewGmailTrigger("On Gmail", {
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
    attachments: [],
  });
  gmailApiClient.messagesById.set("msg_2", {
    messageId: "msg_2",
    labelIds: ["OTHER"],
    headers: {
      Subject: "Ignore",
      From: "sender@example.com",
    },
    snippet: "not relevant",
    attachments: [],
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
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const service = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );

  const items = await service.sync({
    trigger: GmailHistorySyncFixture.trigger,
    client: gmailApiClient,
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
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const service = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );

  const items = await service.sync({
    trigger: GmailHistorySyncFixture.trigger,
    client: gmailApiClient,
    config: GmailHistorySyncFixture.createConfig(),
    notification: {
      emailAddress: "sales@example.com",
      historyId: "history_100",
    },
  });

  assert.deepEqual(items, []);
  assert.deepEqual((await store.load(GmailHistorySyncFixture.trigger))?.state.historyId, "history_99");
});

test("GmailHistorySyncService resolves configured label names to Gmail label ids", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  gmailApiClient.messagesById.set("msg_1", {
    messageId: "msg_1",
    labelIds: ["Label_demo"],
    headers: {
      Subject: "Quote request",
      From: "buyer@example.com",
    },
    snippet: "Need a new quote",
    attachments: [],
  });
  gmailApiClient.historyDelta = {
    historyId: "history_2",
    messageIds: ["msg_1"],
  };
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
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const service = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );

  const items = await service.sync({
    trigger: GmailHistorySyncFixture.trigger,
    client: gmailApiClient,
    config: new OnNewGmailTrigger("On Gmail", {
      mailbox: "sales@example.com",
      topicName: "projects/project-id/topics/gmail",
      subscriptionName: "projects/project-id/subscriptions/gmail",
      labelIds: ["Demo"],
      query: "quote",
    }),
    notification: {
      emailAddress: "sales@example.com",
      historyId: "history_2",
      publishTime: "2026-03-17T12:05:00.000Z",
    },
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.json.messageId, "msg_1");
});
