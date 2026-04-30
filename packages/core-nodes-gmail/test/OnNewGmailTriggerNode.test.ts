import assert from "node:assert/strict";
import type {
  NodeExecutionContext,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryMetricRecord,
} from "@codemation/core";
import { CodemationTelemetryMetricNames, NoOpTelemetryArtifactReference } from "@codemation/core";
import { test } from "vitest";
import { GoogleGmailApiClientFactory } from "../src/adapters/google/GoogleGmailApiClientFactory";
import type { GmailLogger } from "../src/contracts/GmailLogger";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { OnNewGmailTriggerNode } from "../src/nodes/OnNewGmailTriggerNode";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";
import { GmailTriggerAttachmentService } from "../src/services/GmailTriggerAttachmentService";
import { GmailTriggerTestItemService } from "../src/services/GmailTriggerTestItemService";

class FakeGmailApiClient implements GmailApiClient {
  readonly labels = [{ id: "IMPORTANT", name: "IMPORTANT" }] as const;

  readonly messagesById: Readonly<Record<string, GmailMessageRecord>> = {
    message_1: {
      messageId: "message_1",
      labelIds: ["IMPORTANT"],
      headers: {
        Subject: "Quote request",
        From: "buyer@example.com",
      },
      snippet: "Need a quote",
      textPlain: "Need a quote for widgets.",
      attachments: [],
    },
  };

  async getCurrentHistoryId(_args: Readonly<{ mailbox: string }>): Promise<string> {
    return "history_1";
  }

  async listMessageIds(
    _args: Readonly<{ mailbox: string; labelIds?: ReadonlyArray<string>; query?: string; maxResults?: number }>,
  ): Promise<ReadonlyArray<string>> {
    return ["message_1"];
  }

  async listLabels(_args: Readonly<{ mailbox: string }>) {
    return this.labels;
  }

  async getMessage(args: Readonly<{ mailbox: string; messageId: string }>): Promise<GmailMessageRecord> {
    const message = this.messagesById[args.messageId];
    if (!message) {
      throw new Error(`unknown message ${args.messageId}`);
    }
    return message;
  }

  async getAttachmentContent(
    _args: Readonly<{ mailbox: string; messageId: string; attachment: never }>,
  ): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "attachment_1",
      body: new Uint8Array(),
      mimeType: "text/plain",
      filename: "note.txt",
      size: 0,
    };
  }

  async sendMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["message_1"]!;
  }

  async sendRawMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["message_1"]!;
  }

  async replyToMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["message_1"]!;
  }

  async modifyMessageLabels(): Promise<GmailMessageRecord> {
    return this.messagesById["message_1"]!;
  }

  async modifyThreadLabels(): Promise<void> {}
}

class FakeGoogleGmailApiClientFactory {
  constructor(private readonly client: GmailApiClient) {}

  create(): GmailApiClient {
    return this.client;
  }
}

class FakeGmailPollingTriggerRuntime {
  ensureStartedArgs: unknown;

  async ensureStarted(args: unknown) {
    this.ensureStartedArgs = args;
    return {
      mailbox: "sales@example.com",
      processedMessageIds: ["message_1"],
      baselineComplete: true,
    };
  }

  async stop(): Promise<void> {}
}

class FakeAttachmentService {
  attachArgs: unknown;

  async attachForItems(items: unknown) {
    this.attachArgs = items;
    return items;
  }
}

class FakeTestItemService {
  createItemsArgs: unknown;

  async createItems(args: unknown) {
    this.createItemsArgs = args;
    return [
      {
        json: {
          mailbox: "sales@example.com",
          historyId: "history_1",
          messageId: "message_1",
          labelIds: [],
          headers: {},
          attachments: [],
        },
      },
    ];
  }
}

class FakeGmailLogger implements GmailLogger {
  readonly warnings: string[] = [];

  info(_message: string, _exception?: Error): void {}

  warn(message: string, _exception?: Error): void {
    this.warnings.push(message);
  }

  error(_message: string, _exception?: Error): void {}

  debug(_message: string, _exception?: Error): void {}
}

class FakeNodeExecutionTelemetry implements NodeExecutionTelemetry {
  readonly traceId = "trace_1";
  readonly spanId = "span_1";
  readonly metrics: TelemetryMetricRecord[] = [];
  readonly artifacts: TelemetryArtifactAttachment[] = [];

  addSpanEvent(): void {}

  recordMetric(args: TelemetryMetricRecord): void {
    this.metrics.push(args);
  }

  attachArtifact(args: TelemetryArtifactAttachment) {
    this.artifacts.push(args);
    return NoOpTelemetryArtifactReference.value;
  }

  forNode(): NodeExecutionTelemetry {
    return this;
  }

  startChildSpan(): NodeExecutionTelemetry {
    return this;
  }

  asNodeTelemetry(): NodeExecutionTelemetry {
    return this;
  }

  end(): void {}
}

class OnNewGmailTriggerNodeTestFixture {
  static createConfig(
    overrides: Partial<{
      mailbox: string;
      labelIds: ReadonlyArray<string>;
      query: string;
    }> = {},
  ): OnNewGmailTrigger {
    return new OnNewGmailTrigger(
      "On Gmail",
      {
        mailbox: overrides.mailbox ?? "sales@example.com",
        labelIds: overrides.labelIds ?? ["IMPORTANT"],
        query: overrides.query ?? "quote",
      },
      "gmail_trigger",
    );
  }

  static createTestItemService(): GmailTriggerTestItemService {
    return new GmailTriggerTestItemService(
      new GmailConfiguredLabelService(),
      new GmailMessageItemMapper(),
      new GmailQueryMatcher(),
    );
  }

  static createNode(logger: GmailLogger): OnNewGmailTriggerNode {
    const client = new FakeGmailApiClient();
    return new OnNewGmailTriggerNode(
      {} as never,
      new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
      new GmailTriggerAttachmentService(
        new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
      ),
      this.createTestItemService(),
      logger,
    );
  }
}

test("GmailTriggerTestItemService creates a preview item from the latest matching message", async () => {
  const service = OnNewGmailTriggerNodeTestFixture.createTestItemService();
  const client = new FakeGmailApiClient();
  const items = await service.createItems({
    trigger: { workflowId: "wf.gmail", nodeId: "gmail_trigger" },
    client,
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    previousState: undefined,
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0]?.json.mailbox, "sales@example.com");
  assert.deepEqual(items[0]?.json.historyId, "history_1");
  assert.deepEqual(items[0]?.json.messageId, "message_1");
  assert.deepEqual(items[0]?.json.subject, "Quote request");
  assert.deepEqual(items[0]?.json.from, "buyer@example.com");
  assert.deepEqual(items[0]?.json.snippet, "Need a quote");
  assert.deepEqual(items[0]?.json.textPlain, "Need a quote for widgets.");
  assert.deepEqual(items[0]?.json.attachments, []);
});

test("GmailTriggerTestItemService keeps preview items when Gmail search syntax matched upstream", async () => {
  const service = OnNewGmailTriggerNodeTestFixture.createTestItemService();
  const client = new FakeGmailApiClient();
  const items = await service.createItems({
    trigger: { workflowId: "wf.gmail", nodeId: "gmail_trigger" },
    client,
    config: OnNewGmailTriggerNodeTestFixture.createConfig({
      query: "from:buyer@example.com has:attachment newer_than:7d",
    }),
    previousState: undefined,
  });

  assert.equal(items.length, 1);
  assert.deepEqual(items[0]?.json.messageId, "message_1");
});

test("OnNewGmailTriggerNode.execute rejects manual execution without Gmail items", async () => {
  const logger = new FakeGmailLogger();
  const node = OnNewGmailTriggerNodeTestFixture.createNode(logger);
  const ctx = {
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
  } as NodeExecutionContext<OnNewGmailTrigger>;

  await assert.rejects(async () => {
    await node.execute([], ctx);
  }, /cannot be run manually without a pulled Gmail event/);
  assert.equal(logger.warnings.length, 1);
  assert.match(logger.warnings[0] ?? "", /manual execution attempted/);
});

test("OnNewGmailTriggerNode.setup adapts the Gmail session into the runtime client", async () => {
  const logger = new FakeGmailLogger();
  const runtime = new FakeGmailPollingTriggerRuntime();
  const client = new FakeGmailApiClient();
  const attachmentService = new FakeAttachmentService();
  const testItemService = new FakeTestItemService();
  const node = new OnNewGmailTriggerNode(
    runtime as never,
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
    attachmentService as never,
    testItemService as never,
    logger,
  );
  let cleanupRegistered = false;
  const setupState = await node.setup({
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    trigger: { workflowId: "wf.gmail", nodeId: "gmail_trigger" },
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    previousState: undefined,
    getCredential: async () =>
      ({
        auth: {} as never,
        client: {} as never,
        userId: "me",
        scopes: [],
      }) as never,
    registerCleanup: () => {
      cleanupRegistered = true;
    },
    emit: async () => {},
  } as never);
  assert.equal(cleanupRegistered, true);
  assert.deepEqual(setupState?.processedMessageIds, ["message_1"]);
  const ensureStartedArgs = runtime.ensureStartedArgs as { client: GmailApiClient };
  assert.equal(ensureStartedArgs.client, client);
});

test("OnNewGmailTriggerNode.execute records Gmail metrics and message preview telemetry", async () => {
  const logger = new FakeGmailLogger();
  const telemetry = new FakeNodeExecutionTelemetry();
  const node = OnNewGmailTriggerNodeTestFixture.createNode(logger);
  const items = [
    {
      json: {
        mailbox: "sales@example.com",
        historyId: "history_1",
        messageId: "message_1",
        labelIds: ["IMPORTANT"],
        headers: {},
        subject: "Quote request",
        from: "buyer@example.com",
        snippet: "Need a quote",
        attachments: [
          {
            attachmentId: "attachment_1",
            binaryName: "quote-pdf",
            mimeType: "application/pdf",
            size: 42,
          },
        ],
      },
    },
  ] as const;

  const outputs = await node.execute(items, {
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    telemetry,
  } as unknown as NodeExecutionContext<OnNewGmailTrigger>);

  assert.deepEqual(outputs.main, items);
  assert.deepEqual(
    telemetry.metrics.map((metric) => ({ name: metric.name, value: metric.value })),
    [
      { name: CodemationTelemetryMetricNames.gmailMessagesEmitted, value: 1 },
      { name: CodemationTelemetryMetricNames.gmailAttachments, value: 1 },
      { name: CodemationTelemetryMetricNames.gmailAttachmentBytes, value: 42 },
    ],
  );
  assert.equal(telemetry.artifacts.length, 1);
  assert.equal(telemetry.artifacts[0]?.kind, "gmail.messages");
  assert.deepEqual(telemetry.artifacts[0]?.previewJson, [
    {
      mailbox: "sales@example.com",
      messageId: "message_1",
      subject: "Quote request",
      from: "buyer@example.com",
      snippet: "Need a quote",
      attachmentCount: 1,
      attachmentBytes: 42,
      labelIds: ["IMPORTANT"],
    },
  ]);
});

test("OnNewGmailTriggerNode.execute treats missing attachment sizes and preview fields as zero-or-null values", async () => {
  const logger = new FakeGmailLogger();
  const telemetry = new FakeNodeExecutionTelemetry();
  const node = OnNewGmailTriggerNodeTestFixture.createNode(logger);
  const items = [
    {
      json: {
        mailbox: "sales@example.com",
        historyId: "history_1",
        messageId: "message_1",
        labelIds: ["IMPORTANT"],
        headers: {},
        attachments: [
          {
            attachmentId: "attachment_1",
            binaryName: "quote-pdf",
            mimeType: "application/pdf",
          },
        ],
      },
    },
  ] as const;

  const outputs = await node.execute(items, {
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    telemetry,
  } as unknown as NodeExecutionContext<OnNewGmailTrigger>);

  assert.deepEqual(outputs.main, items);
  assert.deepEqual(
    telemetry.metrics.map((metric) => ({ name: metric.name, value: metric.value })),
    [
      { name: CodemationTelemetryMetricNames.gmailMessagesEmitted, value: 1 },
      { name: CodemationTelemetryMetricNames.gmailAttachments, value: 1 },
      { name: CodemationTelemetryMetricNames.gmailAttachmentBytes, value: 0 },
    ],
  );
  assert.deepEqual(telemetry.artifacts[0]?.previewJson, [
    {
      mailbox: "sales@example.com",
      messageId: "message_1",
      subject: null,
      from: null,
      snippet: null,
      attachmentCount: 1,
      attachmentBytes: 0,
      labelIds: ["IMPORTANT"],
    },
  ]);
});

test("OnNewGmailTriggerNode.getTestItems adapts the Gmail session into the preview service", async () => {
  const logger = new FakeGmailLogger();
  const client = new FakeGmailApiClient();
  const testItemService = new FakeTestItemService();
  const node = new OnNewGmailTriggerNode(
    {} as never,
    new FakeGoogleGmailApiClientFactory(client) as unknown as GoogleGmailApiClientFactory,
    new FakeAttachmentService() as never,
    testItemService as never,
    logger,
  );
  const items = await node.getTestItems({
    workflowId: "wf.gmail",
    nodeId: "gmail_trigger",
    trigger: { workflowId: "wf.gmail", nodeId: "gmail_trigger" },
    config: OnNewGmailTriggerNodeTestFixture.createConfig(),
    previousState: undefined,
    getCredential: async () =>
      ({
        auth: {} as never,
        client: {} as never,
        userId: "me",
        scopes: [],
      }) as never,
  } as never);
  assert.equal(items.length, 1);
  const createItemsArgs = testItemService.createItemsArgs as { client: GmailApiClient };
  assert.equal(createItemsArgs.client, client);
});
