/**
 * Tests for definePollingTriggerInternals credential helpers.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import {
  definedNodeCredentialRequirementFactory,
  definedNodeCredentialAccessorFactory,
} from "../../src/authoring/definePollingTriggerInternals";

describe("definedNodeCredentialRequirementFactory", () => {
  test("returns empty array when bindings is undefined", () => {
    const reqs = definedNodeCredentialRequirementFactory.create(undefined);
    assert.deepEqual(reqs, []);
  });

  test("maps string binding to a credential requirement", () => {
    const reqs = definedNodeCredentialRequirementFactory.create({ apiKey: "my-cred-type" });
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0]!.slotKey, "apiKey");
    assert.deepEqual(reqs[0]!.acceptedTypes, ["my-cred-type"]);
  });

  test("maps object binding with array types", () => {
    const reqs = definedNodeCredentialRequirementFactory.create({
      oauth: { type: ["typeA", "typeB"], label: "OAuth Token", optional: true },
    });
    assert.equal(reqs.length, 1);
    assert.deepEqual(reqs[0]!.acceptedTypes, ["typeA", "typeB"]);
    assert.equal(reqs[0]!.label, "OAuth Token");
    assert.equal(reqs[0]!.optional, true);
  });

  test("humanize converts camelCase to title case", () => {
    const reqs = definedNodeCredentialRequirementFactory.create({ apiAccessKey: "t" });
    assert.equal(reqs[0]!.label, "Api Access Key");
  });
});

describe("definedNodeCredentialAccessorFactory", () => {
  test("returns empty object when bindings is undefined", () => {
    const ctx = { getCredential: async () => "x" };
    const accessors = definedNodeCredentialAccessorFactory.create(undefined, ctx as never);
    assert.deepEqual(accessors, {});
  });

  test("creates accessor functions for each binding key", async () => {
    const sessions: Record<string, unknown> = { apiKey: "secret-value" };
    const ctx = { getCredential: async (key: string) => sessions[key] };
    const accessors = definedNodeCredentialAccessorFactory.create({ apiKey: "my-type" }, ctx as never);
    assert.equal(typeof (accessors as Record<string, unknown>).apiKey, "function");
    const session = await (accessors as Record<string, () => Promise<unknown>>).apiKey!();
    assert.equal(session, "secret-value");
  });
});
