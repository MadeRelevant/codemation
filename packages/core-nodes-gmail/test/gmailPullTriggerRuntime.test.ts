import { DefaultExecutionBinaryService, InMemoryBinaryStorage, InMemoryRunDataFactory } from "@codemation/core";
import assert from "node:assert/strict";
import { test } from "vitest";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { OnNewGmailTriggerNode } from "../src/nodes/OnNewGmailTriggerNode";
import { GmailPullTriggerRuntime } from "../src/runtime/GmailPullTriggerRuntime";
import type {
  GmailApiClient,
  GmailHistoryDelta,
  GmailMessageAttachmentContent,
  GmailMessageRecord,
  GmailWatchRegistration,
} from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailHistorySyncService } from "../src/services/GmailHistorySyncService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import type { GmailPulledNotification } from "../src/services/GmailPubSubPullClient";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../src/services/GmailTriggerAttachmentService";
import { GmailTriggerPubSubResourceResolver } from "../src/services/GmailTriggerPubSubResourceResolver";
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
  defaultGcpProjectIdForPubSub: string | undefined = "project-id";

  getDefaultGcpProjectIdForPubSub(): string | undefined {
    return this.defaultGcpProjectIdForPubSub;
  }

  labels = [
    { id: "IMPORTANT", name: "IMPORTANT" },
    { id: "Label_demo", name: "Demo" },
  ] as const;
  messageIds: ReadonlyArray<string> = ["message_1"];
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
    attachments: [],
  };
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
    return this.message;
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "attachment_1",
      body: new TextEncoder().encode("attachment body"),
      mimeType: "application/pdf",
      filename: "quote.pdf",
      size: 15,
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

class NoopGmailLogger {
  info(_message?: string): void {}
  warn(_message?: string): void {}
  error(_message?: string): void {}
  debug(_message?: string): void {}
}

class RecordingGmailLogger extends NoopGmailLogger {
  readonly warnings: string[] = [];

  override warn(message: string): void {
    this.warnings.push(message);
  }
}

class GmailPullTriggerRuntimeFixture {
  static createConfig(): OnNewGmailTrigger {
    return new OnNewGmailTrigger("On Gmail", {
      mailbox: "sales@example.com",
      topicName: "projects/project-id/topics/gmail",
      subscriptionName: "projects/project-id/subscriptions/gmail",
      labelIds: ["IMPORTANT"],
      query: "quote",
    });
  }

  static async waitFor(assertion: () => void): Promise<void> {
    const deadline = performance.now() + 2_000;
    while (performance.now() < deadline) {
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
  const notification = new FakePulledNotification({
    emailAddress: "sales@example.com",
    historyId: "history_2",
    publishTime: "2026-03-17T12:05:00.000Z",
  });
  gmailApiClient.notifications = [notification];
  const store = new InMemoryTriggerSetupStateStore();
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const gmailPubSubResolver = new GmailTriggerPubSubResourceResolver(process.env);
  const historySyncService = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
    gmailPubSubResolver,
  );
  const emittedPayloads: Array<ReadonlyArray<unknown>> = [];
  const runtime = new GmailPullTriggerRuntime(
    {
      pullIntervalMs: 25,
      maxMessagesPerPull: 5,
    },
    store as never,
    new NoopGmailLogger(),
    watchService,
    historySyncService,
    gmailPubSubResolver,
  );

  const initialState = await runtime.ensureStarted({
    trigger: {
      workflowId: "wf.gmail",
      nodeId: "trigger",
    },
    client: gmailApiClient,
    config: GmailPullTriggerRuntimeFixture.createConfig(),
    previousState: undefined,
    emit: async (items) => {
      emittedPayloads.push(items);
    },
  });

  await GmailPullTriggerRuntimeFixture.waitFor(() => {
    assert.equal(gmailApiClient.ensured, true);
    assert.equal(emittedPayloads.length, 1);
    assert.equal(notification.acked, true);
  });

  assert.equal(initialState?.historyId, "history_1");
  assert.equal(emittedPayloads[0]?.[0] && typeof emittedPayloads[0][0], "object");
  await runtime.stop({
    workflowId: "wf.gmail",
    nodeId: "trigger",
  });
});

test("GmailPullTriggerRuntime stops polling after the trigger runtime is torn down", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  const store = new InMemoryTriggerSetupStateStore();
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const gmailPubSubResolver = new GmailTriggerPubSubResourceResolver(process.env);
  const historySyncService = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
    gmailPubSubResolver,
  );
  const emittedPayloads: Array<ReadonlyArray<unknown>> = [];
  const runtime = new GmailPullTriggerRuntime(
    {
      pullIntervalMs: 25,
      maxMessagesPerPull: 5,
    },
    store as never,
    new NoopGmailLogger(),
    watchService,
    historySyncService,
    gmailPubSubResolver,
  );
  const trigger = {
    workflowId: "wf.gmail",
    nodeId: "trigger",
  } as const;

  await runtime.ensureStarted({
    trigger,
    client: gmailApiClient,
    config: GmailPullTriggerRuntimeFixture.createConfig(),
    previousState: undefined,
    emit: async (items) => {
      emittedPayloads.push(items);
    },
  });

  await runtime.stop(trigger);

  gmailApiClient.notifications = [
    new FakePulledNotification({
      emailAddress: "sales@example.com",
      historyId: "history_3",
      publishTime: "2026-03-17T12:06:00.000Z",
    }),
  ];

  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(emittedPayloads.length, 0);
});

test("GmailPullTriggerRuntime skips when Pub/Sub resources cannot be resolved", async () => {
  const store = new InMemoryTriggerSetupStateStore();
  const logger = new RecordingGmailLogger();
  const gmailApiClient = new FakeGmailApiClient();
  gmailApiClient.defaultGcpProjectIdForPubSub = undefined;
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const gmailPubSubResolver = new GmailTriggerPubSubResourceResolver({});
  const historySyncService = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
    gmailPubSubResolver,
  );
  const runtime = new GmailPullTriggerRuntime(
    {
      pullIntervalMs: 25,
      maxMessagesPerPull: 5,
    },
    store as never,
    logger,
    watchService,
    historySyncService,
    gmailPubSubResolver,
  );

  const state = await runtime.ensureStarted({
    trigger: {
      workflowId: "wf.gmail",
      nodeId: "trigger",
    },
    client: gmailApiClient,
    config: new OnNewGmailTrigger("On Gmail", {
      mailbox: "sales@example.com",
    }),
    previousState: undefined,
    emit: async () => {},
  });

  assert.equal(state, undefined);
  assert.equal(gmailApiClient.ensured, false);
  assert.deepEqual(logger.warnings, [
    "Gmail pull trigger skipped (wf.gmail.trigger): could not resolve Pub/Sub topic/subscription (set them on the trigger, or GMAIL_TRIGGER_TOPIC_NAME / GMAIL_TRIGGER_SUBSCRIPTION_NAME, or GOOGLE_CLOUD_PROJECT; service accounts use the credential project id).",
  ]);
});

test("GmailPullTriggerRuntime starts when topic and subscription are omitted but the credential supplies a GCP project id", async () => {
  const store = new InMemoryTriggerSetupStateStore();
  const gmailApiClient = new FakeGmailApiClient();
  const configuredLabelService = new GmailConfiguredLabelService();
  const watchService = new GmailWatchService(configuredLabelService, store as never);
  const gmailPubSubResolver = new GmailTriggerPubSubResourceResolver({});
  const historySyncService = new GmailHistorySyncService(
    store as never,
    watchService,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
    gmailPubSubResolver,
  );
  const runtime = new GmailPullTriggerRuntime(
    {
      pullIntervalMs: 25,
      maxMessagesPerPull: 5,
    },
    store as never,
    new NoopGmailLogger(),
    watchService,
    historySyncService,
    gmailPubSubResolver,
  );

  await runtime.ensureStarted({
    trigger: {
      workflowId: "wf.gmail",
      nodeId: "trigger",
    },
    client: gmailApiClient,
    config: new OnNewGmailTrigger("On Gmail", {
      mailbox: "sales@example.com",
    }),
    previousState: undefined,
    emit: async () => {},
  });

  assert.equal(gmailApiClient.ensured, true);
});

test("OnNewGmailTriggerNode downloads Gmail attachments into item binaries when enabled", async () => {
  const gmailApiClient = new FakeGmailApiClient();
  gmailApiClient.message = {
    ...gmailApiClient.message,
    attachments: [
      {
        attachmentId: "attachment_1",
        binaryName: "quote_pdf",
        filename: "quote.pdf",
        mimeType: "application/pdf",
        size: 128,
      },
    ],
  };
  const binary = new DefaultExecutionBinaryService(
    new InMemoryBinaryStorage(),
    "wf.gmail",
    "run.gmail",
    () => new Date(),
  );
  const node = new OnNewGmailTriggerNode(
    {} as GmailPullTriggerRuntime,
    new GmailTriggerAttachmentService(),
    {} as never,
    new NoopGmailLogger(),
  );

  const outputs = await node.execute(
    [
      {
        json: {
          mailbox: "sales@example.com",
          historyId: "history_2",
          messageId: "message_1",
          labelIds: ["IMPORTANT"],
          headers: {
            Subject: "Quote request",
            From: "buyer@example.com",
          },
          from: "buyer@example.com",
          subject: "Quote request",
          attachments: gmailApiClient.message.attachments,
        },
      },
    ],
    {
      runId: "run.gmail",
      workflowId: "wf.gmail",
      parent: undefined,
      subworkflowDepth: 0,
      engineMaxNodeActivations: 100_000,
      engineMaxSubworkflowDepth: 32,
      now: () => new Date(),
      data: new InMemoryRunDataFactory().create(),
      nodeId: "trigger",
      activationId: "act.gmail",
      config: new OnNewGmailTrigger("On Gmail", {
        mailbox: "sales@example.com",
        topicName: "projects/project-id/topics/gmail",
        subscriptionName: "projects/project-id/subscriptions/gmail",
        downloadAttachments: true,
      }),
      binary: binary.forNode({ nodeId: "trigger", activationId: "act.gmail" }),
      getCredential: async <TSession = unknown>() => gmailApiClient as TSession,
    },
  );

  assert.equal(outputs.main?.[0]?.binary?.quote_pdf?.mimeType, "application/pdf");
  assert.equal(outputs.main?.[0]?.binary?.quote_pdf?.filename, "quote.pdf");
});
