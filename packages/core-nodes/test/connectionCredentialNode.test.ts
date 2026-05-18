import { ConnectionCredentialNode, ConnectionCredentialNodeConfig } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { test } from "vitest";

import { CoreNodesTestContextFactory } from "./testkit/CoreNodesTestContextFactory";

test("ConnectionCredentialNode execute returns empty array (placeholder node)", () => {
  const source = { getCredentialRequirements: () => [] as never[] };
  const config = new ConnectionCredentialNodeConfig("Credential slot", source);
  const ctx = CoreNodesTestContextFactory.create(config);
  const node = new ConnectionCredentialNode();

  const result = node.execute({ input: {}, item: { json: {} }, itemIndex: 0, items: [{ json: {} }], ctx } as never);
  assert.deepEqual(result, []);
});

test("ConnectionCredentialNodeConfig delegates getCredentialRequirements to source", () => {
  const fakeReq = { slotKey: "auth", label: "Auth", acceptedTypes: [], helpText: "" };
  const source = { getCredentialRequirements: () => [fakeReq] };
  const config = new ConnectionCredentialNodeConfig("Credential slot", source);

  const reqs = config.getCredentialRequirements();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0]?.slotKey, "auth");
});

test("ConnectionCredentialNodeConfig returns empty array when source has no getCredentialRequirements", () => {
  const source = {};
  const config = new ConnectionCredentialNodeConfig("Credential slot", source);

  const reqs = config.getCredentialRequirements();
  assert.deepEqual(reqs, []);
});
