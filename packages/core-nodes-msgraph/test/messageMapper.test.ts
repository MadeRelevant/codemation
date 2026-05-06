import { describe, expect, it } from "vitest";
import type { GraphMessageRaw } from "../src/mail/messageMapper";
import { mapGraphMessage } from "../src/mail/messageMapper";

const baseMessage: GraphMessageRaw = {
  id: "msg-1",
  receivedDateTime: "2024-01-15T10:00:00Z",
};

describe("mapGraphMessage", () => {
  it("maps minimal message fields", () => {
    const result = mapGraphMessage(baseMessage);
    expect(result.messageId).toBe("msg-1");
    expect(result.receivedDateTime).toBe("2024-01-15T10:00:00Z");
    expect(result.to).toEqual([]);
    expect(result.from).toBeUndefined();
    expect(result.subject).toBeUndefined();
    expect(result.bodyText).toBeUndefined();
    expect(result.bodyHtml).toBeUndefined();
    expect(result.attachments).toBeUndefined();
  });

  it("maps a plain-text body", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      body: { content: "Hello world", contentType: "text" },
    });
    expect(result.bodyText).toBe("Hello world");
    expect(result.bodyHtml).toBeUndefined();
  });

  it("maps an HTML body", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      body: { content: "<p>Hello</p>", contentType: "html" },
    });
    expect(result.bodyHtml).toBe("<p>Hello</p>");
    expect(result.bodyText).toBeUndefined();
  });

  it("maps from / to / cc / bcc addresses", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      from: { emailAddress: { name: "Alice", address: "alice@example.com" } },
      toRecipients: [
        { emailAddress: { name: "Bob", address: "bob@example.com" } },
        { emailAddress: { name: "Carol", address: "carol@example.com" } },
      ],
      ccRecipients: [{ emailAddress: { address: "dave@example.com" } }],
      bccRecipients: [{ emailAddress: { name: "Eve", address: "eve@example.com" } }],
    });
    expect(result.from).toEqual({ name: "Alice", address: "alice@example.com" });
    expect(result.to).toHaveLength(2);
    expect(result.to[0]).toEqual({ name: "Bob", address: "bob@example.com" });
    expect(result.cc).toHaveLength(1);
    expect(result.cc![0]).toEqual({ name: undefined, address: "dave@example.com" });
    expect(result.bcc).toHaveLength(1);
    expect(result.bcc![0]).toEqual({ name: "Eve", address: "eve@example.com" });
  });

  it("omits cc/bcc when empty arrays", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      ccRecipients: [],
      bccRecipients: [],
    });
    expect(result.cc).toBeUndefined();
    expect(result.bcc).toBeUndefined();
  });

  it("maps attachments", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      attachments: [
        {
          id: "att-1",
          name: "report.pdf",
          contentType: "application/pdf",
          size: 12345,
          contentBytes: "base64data==",
        },
      ],
    });
    expect(result.attachments).toHaveLength(1);
    const att = result.attachments![0]!;
    expect(att.id).toBe("att-1");
    expect(att.name).toBe("report.pdf");
    expect(att.contentType).toBe("application/pdf");
    expect(att.size).toBe(12345);
    // Note: contentBytes is intentionally not on the trigger item (avoids bloating run state).
    // Bytes flow through ctx.binary.attach in execute() when downloadAttachments: true.
    expect((att as { contentBytes?: string }).contentBytes).toBeUndefined();
  });

  it("maps internet message headers", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      internetMessageHeaders: [
        { name: "X-Mailer", value: "Outlook" },
        { name: "Return-Path", value: "bounce@example.com" },
      ],
    });
    expect(result.headers).toEqual({
      "X-Mailer": "Outlook",
      "Return-Path": "bounce@example.com",
    });
  });

  it("maps conversationId and internetMessageId", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      conversationId: "conv-abc",
      internetMessageId: "<abc@example.com>",
    });
    expect(result.conversationId).toBe("conv-abc");
    expect(result.internetMessageId).toBe("<abc@example.com>");
  });

  it("uses epoch fallback when receivedDateTime is missing", () => {
    const result = mapGraphMessage({ id: "msg-x" });
    expect(result.receivedDateTime).toBe(new Date(0).toISOString());
  });

  it("extracts replyToMessageId from In-Reply-To header (case-insensitive)", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      internetMessageHeaders: [
        { name: "In-Reply-To", value: "<original-msg-id@example.com>" },
        { name: "Subject", value: "Re: test" },
      ],
    });
    expect(result.replyToMessageId).toBe("<original-msg-id@example.com>");
  });

  it("extracts replyToMessageId from lowercase in-reply-to header", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      internetMessageHeaders: [{ name: "in-reply-to", value: "<abc@example.com>" }],
    });
    expect(result.replyToMessageId).toBe("<abc@example.com>");
  });

  it("omits replyToMessageId when no In-Reply-To header is present", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      internetMessageHeaders: [{ name: "X-Mailer", value: "Outlook" }],
    });
    expect(result.replyToMessageId).toBeUndefined();
  });

  it("maps inline attachment with isInline and stripped contentId", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      attachments: [
        {
          id: "att-inline-1",
          name: "image001.png",
          contentType: "image/png",
          size: 5000,
          isInline: true,
          contentId: "<image001@example.com>",
        },
      ],
    });
    const att = result.attachments![0]!;
    expect(att.isInline).toBe(true);
    expect(att.contentId).toBe("image001@example.com"); // brackets stripped
  });

  it("omits isInline and contentId for regular attachments", () => {
    const result = mapGraphMessage({
      ...baseMessage,
      attachments: [{ id: "att-1", name: "file.pdf", contentType: "application/pdf", size: 100 }],
    });
    const att = result.attachments![0]!;
    expect(att.isInline).toBeUndefined();
    expect(att.contentId).toBeUndefined();
  });
});
