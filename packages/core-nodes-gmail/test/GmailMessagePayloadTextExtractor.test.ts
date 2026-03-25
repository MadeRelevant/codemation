import assert from "node:assert/strict";
import { test } from "vitest";

import { GmailMessagePayloadTextExtractor } from "../src/adapters/google/GmailMessagePayloadTextExtractor";

function base64UrlUtf8(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

const extractor = new GmailMessagePayloadTextExtractor();

test("extracts text/plain from a single-part message", () => {
  const result = extractor.extract({
    mimeType: "text/plain",
    body: { data: base64UrlUtf8("Hello from polling") },
  });
  assert.equal(result.textPlain, "Hello from polling");
  assert.equal(result.textHtml, undefined);
});

test("extracts text/plain and text/html from multipart/alternative", () => {
  const result = extractor.extract({
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: base64UrlUtf8("Plain body") } },
      { mimeType: "text/html", body: { data: base64UrlUtf8("<p>Html body</p>") } },
    ],
  });
  assert.equal(result.textPlain, "Plain body");
  assert.equal(result.textHtml, "<p>Html body</p>");
});

test("skips parts that only have attachmentId (no inline data)", () => {
  const result = extractor.extract({
    mimeType: "multipart/mixed",
    parts: [
      {
        mimeType: "text/plain",
        body: { attachmentId: "ang123", size: 100 },
      },
    ],
  });
  assert.equal(result.textPlain, undefined);
});
