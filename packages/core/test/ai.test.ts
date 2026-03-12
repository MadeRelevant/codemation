import assert from "node:assert/strict";
import test from "node:test";

import { AgentAttachmentNodeIdFactory } from "../dist/index.js";

test("AgentAttachmentNodeIdFactory creates and parses language model invocation node ids", () => {
  const nodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId("agent_1", 1);

  assert.equal(nodeId, "agent_1::llm::1");
  assert.deepEqual(AgentAttachmentNodeIdFactory.parseLanguageModelNodeId(nodeId), {
    parentNodeId: "agent_1",
    invocationIndex: 1,
  });
  assert.equal(AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(nodeId), "agent_1::llm");
  assert.equal(AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId("agent_1::llm"), "agent_1::llm");
});

test("AgentAttachmentNodeIdFactory creates and parses tool invocation node ids", () => {
  const nodeId = AgentAttachmentNodeIdFactory.createToolNodeId("agent_1", "lookup tool", 2);

  assert.equal(nodeId, "agent_1::tool::lookup_tool::2");
  assert.deepEqual(AgentAttachmentNodeIdFactory.parseToolNodeId(nodeId), {
    parentNodeId: "agent_1",
    toolName: "lookup_tool",
    invocationIndex: 2,
  });
  assert.equal(AgentAttachmentNodeIdFactory.getBaseToolNodeId(nodeId), "agent_1::tool::lookup_tool");
  assert.equal(AgentAttachmentNodeIdFactory.getBaseToolNodeId("agent_1::tool::lookup_tool"), "agent_1::tool::lookup_tool");
});
