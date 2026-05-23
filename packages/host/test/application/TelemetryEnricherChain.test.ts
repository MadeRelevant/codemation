/**
 * Behavioral tests for TelemetryEnricherChain.
 * Tests enrichNode and enrichRun with various workflow/node configurations.
 */
import { describe, expect, it } from "vitest";
import { TelemetryEnricherChain } from "../../src/application/telemetry/TelemetryEnricherChain";
import type { WorkflowDefinition } from "@codemation/core";

function makeChain(workflow: WorkflowDefinition | null = null) {
  const repo = { getDefinition: async () => workflow };
  return new TelemetryEnricherChain(repo as never);
}

const BASE_WORKFLOW: WorkflowDefinition = {
  id: "wf-1",
  name: "Test Workflow",
  nodes: [{ id: "node-1", kind: "action", name: "My Node", config: {}, type: undefined } as never],
  edges: [],
};

describe("TelemetryEnricherChain.enrichRun", () => {
  it("returns empty object when workflow not found", async () => {
    const chain = makeChain(null);
    const result = await chain.enrichRun("wf-missing");
    expect(result.workflowFolder).toBeUndefined();
  });

  it("returns undefined workflowFolder when no discoveryPathSegments", async () => {
    const chain = makeChain({ ...BASE_WORKFLOW });
    const result = await chain.enrichRun("wf-1");
    expect(result.workflowFolder).toBeUndefined();
  });

  it("returns workflowFolder from discoveryPathSegments", async () => {
    const workflow = {
      ...BASE_WORKFLOW,
      discoveryPathSegments: ["folder", "subfolder", "workflow"],
    };
    const chain = makeChain(workflow as never);
    const result = await chain.enrichRun("wf-1");
    expect(result.workflowFolder).toBe("folder/subfolder");
  });

  it("returns empty string for single-segment path", async () => {
    const workflow = {
      ...BASE_WORKFLOW,
      discoveryPathSegments: ["workflow"],
    };
    const chain = makeChain(workflow as never);
    const result = await chain.enrichRun("wf-1");
    // Single segment means the workflow IS the folder — path without last segment is ""
    expect(result.workflowFolder).toBe("");
  });
});

describe("TelemetryEnricherChain.enrichNode", () => {
  it("returns empty object when workflow not found", async () => {
    const chain = makeChain(null);
    const result = await chain.enrichNode({ workflowId: "wf-missing", nodeId: "n-1" });
    expect(result).toEqual({});
  });

  it("returns workflowFolder without nodeType when node not found in workflow", async () => {
    const workflow = {
      ...BASE_WORKFLOW,
      discoveryPathSegments: ["folder", "wf"],
    };
    const chain = makeChain(workflow as never);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "nonexistent-node" });
    expect(result.workflowFolder).toBe("folder");
    expect(result.nodeType).toBeUndefined();
    expect(result.nodeRole).toBeUndefined();
  });

  it("returns nodeRole=workflowNode for nodes not in any connection", async () => {
    const chain = makeChain(BASE_WORKFLOW);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "node-1" });
    expect(result.nodeRole).toBe("workflowNode");
  });

  it("returns nodeRole=languageModel for nodes in llm connection", async () => {
    const workflow: WorkflowDefinition = {
      ...BASE_WORKFLOW,
      nodes: [
        { id: "agent-1", kind: "action", name: "Agent", config: {} } as never,
        { id: "llm-1", kind: "action", name: "LLM", config: {} } as never,
      ],
      connections: [{ parentNodeId: "agent-1", connectionName: "llm", childNodeIds: ["llm-1"] }] as never,
    };
    const chain = makeChain(workflow);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "llm-1" });
    expect(result.nodeRole).toBe("languageModel");
  });

  it("returns nodeRole=tool for nodes in non-llm connection", async () => {
    const workflow: WorkflowDefinition = {
      ...BASE_WORKFLOW,
      nodes: [
        { id: "agent-1", kind: "action", name: "Agent", config: {} } as never,
        { id: "tool-1", kind: "action", name: "Tool", config: {} } as never,
      ],
      connections: [{ parentNodeId: "agent-1", connectionName: "tools", childNodeIds: ["tool-1"] }] as never,
    };
    const chain = makeChain(workflow);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "tool-1" });
    expect(result.nodeRole).toBe("tool");
  });

  it("caches workflow definition on subsequent calls", async () => {
    let callCount = 0;
    const repo = {
      getDefinition: async () => {
        callCount++;
        return BASE_WORKFLOW;
      },
    };
    const chain = new TelemetryEnricherChain(repo as never);
    await chain.enrichRun("wf-1");
    await chain.enrichRun("wf-1");
    expect(callCount).toBe(1); // Second call uses cache
  });

  it("returns nodeType from named class type", async () => {
    class MyNodeType {}
    const workflow: WorkflowDefinition = {
      ...BASE_WORKFLOW,
      nodes: [{ id: "typed-node", kind: "action", name: "Typed", config: {}, type: MyNodeType } as never],
    };
    const chain = makeChain(workflow);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "typed-node" });
    expect(result.nodeType).toBe("MyNodeType");
  });

  it("returns nodeType from symbol type", async () => {
    const symType = Symbol.for("my.node.type");
    const workflow: WorkflowDefinition = {
      ...BASE_WORKFLOW,
      nodes: [{ id: "sym-node", kind: "action", name: "Symbolic", config: {}, type: symType } as never],
    };
    const chain = makeChain(workflow);
    const result = await chain.enrichNode({ workflowId: "wf-1", nodeId: "sym-node" });
    expect(result.nodeType).toBeDefined();
  });
});
