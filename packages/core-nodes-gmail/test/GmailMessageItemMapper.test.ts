import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailMessageItemMapper } from "../src/services/GmailMessageItemMapper";

class GmailMessageItemMapperFixture {
  static createMessages() {
    return [
      {
        messageId: "message_1",
        labelIds: ["IMPORTANT"],
        headers: {
          Subject: "First",
          From: "first@example.com",
        },
        snippet: "First snippet",
        attachments: [],
      },
      {
        messageId: "message_2",
        labelIds: ["IMPORTANT"],
        headers: {
          Subject: "Second",
          From: "second@example.com",
        },
        snippet: "Second snippet",
        attachments: [],
      },
    ] as const;
  }
}

test("GmailMessageItemMapper maps one Gmail message to one workflow item", () => {
  const mapper = new GmailMessageItemMapper();
  const items = mapper.mapMany({
    mailbox: "sales@example.com",
    historyId: "history_1",
    messages: GmailMessageItemMapperFixture.createMessages(),
  });

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.json.messageId),
    ["message_1", "message_2"],
  );
  assert.deepEqual(
    items.map((item) => item.json.subject),
    ["First", "Second"],
  );
  assert.equal(Array.isArray((items[0]?.json as Record<string, unknown>)["results"]), false);
  assert.equal(Array.isArray((items[0]?.json as Record<string, unknown>)["foundItems"]), false);
  assert.equal(Array.isArray((items[0]?.json as Record<string, unknown>)["items"]), false);
});
