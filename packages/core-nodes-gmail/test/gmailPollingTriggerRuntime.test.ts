import { test } from "vitest";
import type { PersistedTriggerSetupState, TriggerInstanceId, TriggerSetupStateRepository } from "@codemation/core";
import assert from "node:assert/strict";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { GmailPollingTriggerRuntime } from "../src/runtime/GmailPollingTriggerRuntime";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";
import { GmailPollingService } from "../src/services/GmailPollingService";
import { GmailQueryMatcher } from "../src/services/GmailQueryMatcher";

class InMemoryTriggerSetupStateRepository implements TriggerSetupStateRepository {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(`${trigger.workflowId}:${trigger.nodeId}`);
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(`${state.trigger.workflowId}:${state.trigger.nodeId}`, state);
  }

  async delete(trigger: TriggerInstanceId): Promise<void> {
    this.statesByKey.delete(`${trigger.workflowId}:${trigger.nodeId}`);
  }
}

class FakeGmailApiClient implements GmailApiClient {
  labels = [
    { id: "IMPORTANT", name: "IMPORTANT" },
    { id: "Label_demo", name: "Demo" },
  ] as const;

  listCallCount = 0;

  readonly messagesById: Readonly<Record<string, GmailMessageRecord>> = {
    m1: {
      messageId: "m1",
      labelIds: ["IMPORTANT"],
      headers: { Subject: "Old", From: "a@example.com" },
      snippet: "old",
      attachments: [],
    },
    m2: {
      messageId: "m2",
      labelIds: ["IMPORTANT"],
      headers: { Subject: "Quote request", From: "buyer@example.com" },
      snippet: "Need a quote",
      textPlain: "Please send a quote for the attached scope.",
      attachments: [],
    },
  };

  async getCurrentHistoryId(): Promise<string> {
    return "history_profile";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    this.listCallCount += 1;
    if (this.listCallCount === 1) {
      return ["m1"];
    }
    return ["m2", "m1"];
  }

  async listLabels() {
    return this.labels;
  }

  async getMessage(args: Readonly<{ messageId: string }>): Promise<GmailMessageRecord> {
    const message = this.messagesById[args.messageId];
    if (!message) {
      throw new Error(`unknown message ${args.messageId}`);
    }
    return message;
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    return {
      attachmentId: "a1",
      body: new Uint8Array(),
      mimeType: "text/plain",
      filename: "x.txt",
      size: 0,
    };
  }

  async sendMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async sendRawMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async replyToMessage(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async modifyMessageLabels(): Promise<GmailMessageRecord> {
    return this.messagesById["m2"]!;
  }

  async modifyThreadLabels(): Promise<void> {}
}

class NoopGmailLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
  debug(): void {}
}

class GmailPollingTriggerRuntimeFixture {
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

  static async waitFor(assertion: () => void): Promise<void> {
    const deadline = performance.now() + 3_000;
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

test("GmailPollingTriggerRuntime baselines on first poll then emits new messages", async () => {
  const store = new InMemoryTriggerSetupStateRepository();
  const configuredLabelService = new GmailConfiguredLabelService();
  const pollingService = new GmailPollingService(
    store,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );
  const runtime = new GmailPollingTriggerRuntime(
    { pollIntervalMs: 25, maxMessagesPerPoll: 20 },
    new NoopGmailLogger(),
    pollingService,
  );
  const gmailApiClient = new FakeGmailApiClient();
  const emitted: unknown[] = [];
  const trigger = { workflowId: "wf.gmail", nodeId: "gmail_trigger" };
  await runtime.ensureStarted({
    trigger,
    client: gmailApiClient,
    config: GmailPollingTriggerRuntimeFixture.createConfig(),
    previousState: undefined,
    emit: async (items) => {
      emitted.push(...items);
    },
  });
  assert.equal(emitted.length, 0);
  await GmailPollingTriggerRuntimeFixture.waitFor(() => {
    assert.ok(emitted.length >= 1);
  });
  assert.ok(
    emitted.some(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "json" in row &&
        (row as { json: { messageId?: string } }).json.messageId === "m2",
    ),
  );
  await runtime.stop(trigger);
});

test("GmailPollingTriggerRuntime emits new messages for Gmail search syntax queries", async () => {
  const store = new InMemoryTriggerSetupStateRepository();
  const configuredLabelService = new GmailConfiguredLabelService();
  const pollingService = new GmailPollingService(
    store,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );
  const runtime = new GmailPollingTriggerRuntime(
    { pollIntervalMs: 25, maxMessagesPerPoll: 20 },
    new NoopGmailLogger(),
    pollingService,
  );
  const gmailApiClient = new FakeGmailApiClient();
  const emitted: unknown[] = [];
  const trigger = { workflowId: "wf.gmail", nodeId: "gmail_trigger" };
  await runtime.ensureStarted({
    trigger,
    client: gmailApiClient,
    config: GmailPollingTriggerRuntimeFixture.createConfig({
      query: "from:buyer@example.com has:attachment newer_than:7d",
    }),
    previousState: undefined,
    emit: async (items) => {
      emitted.push(...items);
    },
  });
  await GmailPollingTriggerRuntimeFixture.waitFor(() => {
    assert.ok(emitted.length >= 1);
  });
  assert.ok(
    emitted.some(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "json" in row &&
        (row as { json: { messageId?: string } }).json.messageId === "m2",
    ),
  );
  await runtime.stop(trigger);
});

test("GmailPollingTriggerRuntime stop clears the poll loop", async () => {
  const store = new InMemoryTriggerSetupStateRepository();
  const configuredLabelService = new GmailConfiguredLabelService();
  const pollingService = new GmailPollingService(
    store,
    configuredLabelService,
    new GmailMessageItemMapper(),
    new GmailQueryMatcher(),
  );
  const runtime = new GmailPollingTriggerRuntime(
    { pollIntervalMs: 25, maxMessagesPerPoll: 20 },
    new NoopGmailLogger(),
    pollingService,
  );
  const gmailApiClient = new FakeGmailApiClient();
  const trigger = { workflowId: "wf.gmail", nodeId: "gmail_trigger" };
  await runtime.ensureStarted({
    trigger,
    client: gmailApiClient,
    config: GmailPollingTriggerRuntimeFixture.createConfig(),
    previousState: undefined,
    emit: async () => {},
  });
  await runtime.stop(trigger);
  const callsAfterStop = gmailApiClient.listCallCount;
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(gmailApiClient.listCallCount, callsAfterStop);
});
