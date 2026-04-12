import assert from "node:assert/strict";
import { test } from "vitest";
import { OnNewGmailTrigger } from "../src/nodes/OnNewGmailTrigger";
import { GmailConfiguredLabelService } from "../src/services/GmailConfiguredLabelService";
import type { GmailApiClient, GmailMessageAttachmentContent, GmailMessageRecord } from "../src/services/GmailApiClient";

class FakeGmailApiClient implements GmailApiClient {
  async getCurrentHistoryId(): Promise<string> {
    return "history_1";
  }

  async listMessageIds(): Promise<ReadonlyArray<string>> {
    return [];
  }

  async listLabels(): Promise<ReadonlyArray<{ id: string; name: string }>> {
    return [
      { id: "INBOX", name: "Inbox" },
      { id: "Label_demo", name: "Demo" },
    ];
  }

  async getMessage(): Promise<GmailMessageRecord> {
    throw new Error("not used");
  }

  async getAttachmentContent(): Promise<GmailMessageAttachmentContent> {
    throw new Error("not used");
  }

  async sendMessage(): Promise<GmailMessageRecord> {
    throw new Error("not used");
  }

  async sendRawMessage(): Promise<GmailMessageRecord> {
    throw new Error("not used");
  }

  async replyToMessage(): Promise<GmailMessageRecord> {
    throw new Error("not used");
  }

  async modifyMessageLabels(): Promise<GmailMessageRecord> {
    throw new Error("not used");
  }

  async modifyThreadLabels(): Promise<void> {}
}

test("GmailConfiguredLabelService resolves configured label names and ids", async () => {
  const service = new GmailConfiguredLabelService();
  const labels = await service.resolveLabelIds({
    client: new FakeGmailApiClient(),
    mailbox: "sales@example.com",
    configuredLabels: ["Inbox", "Label_demo"],
  });
  assert.deepEqual(labels, ["INBOX", "Label_demo"]);
});

test("GmailConfiguredLabelService reports unknown labels and OnNewGmailTrigger validates mailbox", async () => {
  const service = new GmailConfiguredLabelService();
  await assert.rejects(
    async () =>
      await service.resolveLabelIds({
        client: new FakeGmailApiClient(),
        mailbox: "sales@example.com",
        configuredLabels: ["Missing"],
      }),
    /Unknown Gmail label/,
  );
  const trigger = new OnNewGmailTrigger("On Gmail", {
    mailbox: "   ",
  });
  assert.deepEqual(trigger.resolveMissingConfigurationFields(), ["mailbox"]);
  assert.equal(trigger.hasRequiredConfiguration(), false);
});
