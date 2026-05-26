/**
 * Tests for scenario/hitl-agent-with-approval.example.ts
 *
 * Verifies the compiled workflow graph shape:
 * - the agent node exists
 * - the agent has exactly two tools
 * - both tools are backed by inboxApproval nodes
 * - the two tools have different onRejected behaviors ("halt" and "return")
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { workflow } from "../src/examples/scenario/hitl-agent-with-approval.example";
import { inboxApproval } from "@codemation/core-nodes";
import type { ToolConfig } from "@codemation/core";
import type { NodeBackedToolConfig } from "@codemation/core";
import type { AIAgent } from "@codemation/core-nodes";
import type { NodeConfigBase } from "@codemation/core";

// Derive the type token for the inbox approval node.
const inboxApprovalType = inboxApproval.create(
  { title: "t", body: "b", priority: "normal", timeout: "24h", onTimeout: "halt" },
  "probe",
).type;

/** Checks whether a tool config is backed by an inboxApproval node. */
function isInboxApprovalTool(tool: ToolConfig): boolean {
  const nodeBackedTool = tool as NodeBackedToolConfig<any, any, any>;
  return typeof nodeBackedTool.node === "object" && (nodeBackedTool.node as NodeConfigBase).type === inboxApprovalType;
}

/** Reads the humanApprovalToolBehavior from a NodeBackedToolConfig's node. */
function getOnRejected(tool: ToolConfig): "halt" | "return" | undefined {
  const nodeBackedTool = tool as NodeBackedToolConfig<any, any, any>;
  const behavior = (nodeBackedTool.node as Record<string, unknown>)["humanApprovalToolBehavior"] as
    | { onRejected?: "halt" | "return" }
    | undefined;
  return behavior?.onRejected;
}

describe("hitl-agent-with-approval workflow graph", () => {
  it("builds a non-empty workflow definition", () => {
    assert.ok(workflow.nodes.length > 0, "workflow must have at least one node");
  });

  it("contains an agent node", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "workflow must have at least one runnable node (the agent)");
  });

  it("agent has exactly two tools", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "no agent node found");
    const agentConfig = agentNode.config as AIAgent;
    assert.ok(Array.isArray(agentConfig.tools), "agent config must have a tools array");
    assert.equal(agentConfig.tools.length, 2, `expected 2 tools, got ${agentConfig.tools.length}`);
  });

  it("both tools are backed by inboxApproval nodes", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "no agent node found");
    const agentConfig = agentNode.config as AIAgent;
    for (const tool of agentConfig.tools) {
      assert.ok(isInboxApprovalTool(tool), `tool "${tool.name}" must be backed by inboxApproval`);
    }
  });

  it("one tool has onRejected:'halt' and one has onRejected:'return'", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "no agent node found");
    const agentConfig = agentNode.config as AIAgent;
    const behaviors = agentConfig.tools.map((t) => getOnRejected(t));
    assert.ok(behaviors.includes("halt"), "one tool must have onRejected:'halt'");
    assert.ok(behaviors.includes("return"), "one tool must have onRejected:'return'");
  });

  it("critical tool has name 'request_human_approval_critical'", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "no agent node found");
    const agentConfig = agentNode.config as AIAgent;
    const criticalTool = agentConfig.tools.find((t) => getOnRejected(t) === "halt");
    assert.ok(criticalTool, "critical tool (onRejected:halt) must exist");
    assert.equal(criticalTool.name, "request_human_approval_critical");
  });

  it("soft tool has name 'request_human_approval_soft'", () => {
    const agentNode = workflow.nodes.find((n) => n.kind === "node");
    assert.ok(agentNode, "no agent node found");
    const agentConfig = agentNode.config as AIAgent;
    const softTool = agentConfig.tools.find((t) => getOnRejected(t) === "return");
    assert.ok(softTool, "soft tool (onRejected:return) must exist");
    assert.equal(softTool.name, "request_human_approval_soft");
  });
});
