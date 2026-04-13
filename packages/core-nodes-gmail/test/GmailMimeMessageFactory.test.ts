import assert from "node:assert/strict";
import { test } from "vitest";
import { GmailMimeMessageFactory } from "../src/adapters/google/GmailMimeMessageFactory";

test("GmailMimeMessageFactory encodes non-ASCII subjects as RFC2047", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["a@b.com"],
    subject: "Facture café",
    text: "ok",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /Subject: =\?UTF-8\?B\?/);
});

test("GmailMimeMessageFactory builds html-only body without multipart alternative", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["a@b.com"],
    subject: "Hi",
    html: "<b>x</b>",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /Content-Type: text\/html/);
  assert.ok(!decoded.includes("multipart/alternative"));
});

test("GmailMimeMessageFactory builds text-only body without multipart alternative", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["a@b.com"],
    subject: "Hi",
    text: "plain",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /Content-Type: text\/plain/);
});

test("GmailMimeMessageFactory includes Cc, Bcc, Reply-To, From, and custom headers", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["to@b.com"],
    subject: "S",
    text: "t",
    cc: ["cc@b.com"],
    bcc: ["bcc@b.com"],
    replyTo: "reply@b.com",
    from: "from@b.com",
    headers: { "X-Custom": "1" },
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /Cc: cc@b.com/);
  assert.match(decoded, /Bcc: bcc@b.com/);
  assert.match(decoded, /Reply-To: reply@b.com/);
  assert.match(decoded, /From: from@b.com/);
  assert.match(decoded, /X-Custom: 1/);
});

test("GmailMimeMessageFactory builds mixed multipart with attachment-only body", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["a@b.com"],
    subject: "Att",
    attachments: [
      {
        filename: "doc.txt",
        mimeType: "text/plain",
        body: "data",
        contentId: "cid1",
        disposition: "inline",
        contentTransferEncoding: "quoted-printable",
      },
    ],
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /multipart\/mixed/);
  assert.match(decoded, /Content-ID: <cid1>/);
  assert.match(decoded, /Content-Disposition: inline/);
  assert.match(decoded, /Content-Transfer-Encoding: quoted-printable/);
  assert.match(decoded, /filename="doc.txt"/);
});

test("GmailMimeMessageFactory encodes Uint8Array attachment bodies as base64", () => {
  const factory = new GmailMimeMessageFactory();
  const raw = factory.createMessage({
    to: ["a@b.com"],
    subject: "Bin",
    text: "t",
    attachments: [
      {
        filename: "b.bin",
        mimeType: "application/octet-stream",
        body: new Uint8Array([0, 1, 2]),
      },
    ],
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(decoded, /AAEC/);
});
