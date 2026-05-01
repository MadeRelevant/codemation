import assert from "node:assert/strict";
import "reflect-metadata";
import type { Item } from "@codemation/core";
import { WorkflowTestKit } from "@codemation/core/testing";
import { MapData, MapDataNode, WorkflowChain, createWorkflowBuilder } from "@codemation/core-nodes";
import { test } from "vitest";
import { SendGmailMessage, type SendGmailMessageInputJson } from "../src/nodes/SendGmailMessage";
import { SendGmailMessageNode } from "../src/nodes/SendGmailMessageNode";
import { GmailSendMessageService } from "../src/services/GmailSendMessageService";

class RecordingGmailSendMessageService {
  readonly calls: unknown[] = [];

  async send(input: unknown): Promise<Readonly<{ messageId: string }>> {
    this.calls.push(input);
    return { messageId: "sent_1" };
  }
}

class GmailComposableWorkflowFixture {
  static buildWorkflow() {
    const builder = createWorkflowBuilder({
      id: "wf.gmail.composable-send",
      name: "Composable Gmail Send",
    });
    return new WorkflowChain(
      builder.start(
        new MapData<Readonly<{ recipient: string; subject: string; html: string }>, SendGmailMessageInputJson>(
          "Build Gmail input",
          (item) => ({
            to: item.json.recipient,
            subject: item.json.subject,
            html: item.json.html,
          }),
          { id: "build-gmail-input" },
        ),
      ),
    )
      .then(new SendGmailMessage("Send Gmail", "send-gmail"))
      .build();
  }

  static asRecord(value: unknown): Record<string, unknown> {
    return value as Record<string, unknown>;
  }
}

test("SendGmailMessage composes after a standard map step", async () => {
  const kit = new WorkflowTestKit();
  const service = new RecordingGmailSendMessageService();
  kit.dependencyContainer.registerSingleton(MapDataNode, MapDataNode);
  kit.dependencyContainer.registerSingleton(SendGmailMessageNode, SendGmailMessageNode);
  kit.dependencyContainer.registerInstance(GmailSendMessageService, service as unknown as GmailSendMessageService);

  const result = await kit.run({
    workflow: GmailComposableWorkflowFixture.buildWorkflow(),
    startAt: "build-gmail-input",
    items: [
      {
        json: {
          recipient: "buyer@example.com",
          subject: "Quote response",
          html: "<p>Thanks</p>",
        },
      },
    ],
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((item: Item) => item.json),
    [{ messageId: "sent_1" }],
  );
  assert.equal(service.calls.length, 1);
  const call = GmailComposableWorkflowFixture.asRecord(service.calls[0]);
  assert.deepEqual(call["input"], {
    to: "buyer@example.com",
    subject: "Quote response",
    html: "<p>Thanks</p>",
  });
});
