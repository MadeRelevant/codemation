import assert from "node:assert/strict";
import { test } from "vitest";

import { parseCredentialInstanceTestPayload } from "../../src/features/credentials/lib/credentialInstanceTestPayloadParser";

test("parses valid JSON and returns the object", () => {
  const result = parseCredentialInstanceTestPayload('{"status":"ok","message":"Connected"}');
  assert.equal(result.status, "ok");
  assert.equal(result.message, "Connected");
});

test("returns empty object for empty string", () => {
  const result = parseCredentialInstanceTestPayload("");
  assert.deepEqual(result, {});
});

test("returns empty object for whitespace-only string", () => {
  const result = parseCredentialInstanceTestPayload("   ");
  assert.deepEqual(result, {});
});

test("falls back to message=text for invalid JSON", () => {
  const result = parseCredentialInstanceTestPayload("Connection refused");
  assert.equal(result.message, "Connection refused");
  assert.equal(result.status, undefined);
});

test("falls back with default message for non-empty invalid JSON that is falsy-ish", () => {
  // The code does `message: text || "Test failed"` — a non-empty string is truthy so it's preserved.
  const result = parseCredentialInstanceTestPayload("{bad json}");
  assert.equal(result.message, "{bad json}");
});
