import assert from "node:assert/strict";
import { test } from "vitest";

import { ConnectionNodeIdFactory } from "../../src/workflow/ConnectionNodeIdFactory";

test("ConnectionNodeIdFactory builds stable language model and tool connection node ids", () => {
  const llm = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");
  assert.equal(llm, "agent_1__conn__llm");
  assert.equal(ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(llm), true);
});

test("ConnectionNodeIdFactory normalizes tool names and detects tool connection ids", () => {
  const tool = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "lookup tool");
  assert.equal(tool, "agent_1__conn__tool__conn__lookup_tool");
  assert.equal(ConnectionNodeIdFactory.isToolConnectionNodeId(tool), true);
  assert.equal(ConnectionNodeIdFactory.normalizeToolName("lookup tool"), "lookup_tool");
});

test("ConnectionNodeIdFactory classifies connection-owned descendants", () => {
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1__conn__llm"), true);
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1__conn__tool__conn__x"), true);
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1"), false);
});
