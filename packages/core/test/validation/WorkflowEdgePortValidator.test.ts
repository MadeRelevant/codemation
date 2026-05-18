import { describe, it, expect } from "vitest";
import type { NodeDefinition, Edge, WorkflowDefinition } from "../../src/index.ts";
import { WorkflowEdgePortValidator } from "../../src/index.ts";

// Minimal stubs — only the fields the validator reads.
function makeNode(id: string, declaredOutputPorts?: readonly string[]): NodeDefinition {
  return {
    id,
    kind: "node",
    type: { name: id } as unknown as NodeDefinition["type"],
    name: id,
    config: {
      kind: "node",
      type: { name: id } as unknown as NodeDefinition["type"],
      name: id,
      ...(declaredOutputPorts !== undefined ? { declaredOutputPorts } : {}),
    },
  };
}

function makeEdge(fromNodeId: string, output: string, toNodeId: string): Edge {
  return { from: { nodeId: fromNodeId, output }, to: { nodeId: toNodeId, input: "in" } };
}

function workflow(nodes: NodeDefinition[], edges: Edge[]): Pick<WorkflowDefinition, "nodes" | "edges"> {
  return { nodes, edges };
}

const validator = new WorkflowEdgePortValidator();

describe("WorkflowEdgePortValidator", () => {
  it("valid — If node with true/false edges passes", () => {
    const ifNode = makeNode("if-1", ["true", "false"]);
    const nextNode = makeNode("next-1");
    const wf = workflow([ifNode, nextNode], [makeEdge("if-1", "true", "next-1"), makeEdge("if-1", "false", "next-1")]);

    const result = validator.validate(wf);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("invalid — If node with rogue 'main' edge fails (the original bug)", () => {
    const ifNode = makeNode("if-1", ["true", "false"]);
    const nextNode = makeNode("next-1");
    const wf = workflow([ifNode, nextNode], [makeEdge("if-1", "main", "next-1")]);

    const result = validator.validate(wf);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0]!;
    expect(error.sourceNodeId).toBe("if-1");
    expect(error.badPort).toBe("main");
    expect(error.allowedPorts).toEqual(["true", "false"]);
    expect(error.message).toContain('"if-1"');
    expect(error.message).toContain('"main"');
    expect(error.message).toContain('"true"');
    expect(error.message).toContain('"false"');
  });

  it("Switch dynamic cases — valid edges to declared case ports and default pass", () => {
    const switchNode = makeNode("sw-1", ["a", "b", "default"]);
    const nodeA = makeNode("a-1");
    const nodeB = makeNode("b-1");
    const nodeDefault = makeNode("def-1");
    const wf = workflow(
      [switchNode, nodeA, nodeB, nodeDefault],
      [makeEdge("sw-1", "a", "a-1"), makeEdge("sw-1", "b", "b-1"), makeEdge("sw-1", "default", "def-1")],
    );

    const result = validator.validate(wf);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("Switch dynamic cases — edge to undeclared port 'c' fails", () => {
    const switchNode = makeNode("sw-1", ["a", "b", "default"]);
    const nodeC = makeNode("c-1");
    const wf = workflow([switchNode, nodeC], [makeEdge("sw-1", "c", "c-1")]);

    const result = validator.validate(wf);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.badPort).toBe("c");
    expect(result.errors[0]!.allowedPorts).toEqual(["a", "b", "default"]);
  });

  it("legacy node without declaredOutputPorts — edge to 'main' passes (unconstrained)", () => {
    const legacyNode = makeNode("legacy-1"); // no declaredOutputPorts
    const nextNode = makeNode("next-1");
    const wf = workflow([legacyNode, nextNode], [makeEdge("legacy-1", "main", "next-1")]);

    const result = validator.validate(wf);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("multi-error — workflow with 3 bad edges surfaces all 3 errors", () => {
    const ifNode = makeNode("if-1", ["true", "false"]);
    const switchNode = makeNode("sw-1", ["approved", "rejected"]);
    const nextNode = makeNode("next-1");
    const wf = workflow(
      [ifNode, switchNode, nextNode],
      [
        makeEdge("if-1", "main", "next-1"),
        makeEdge("sw-1", "pending", "next-1"),
        makeEdge("sw-1", "unknown", "next-1"),
      ],
    );

    const result = validator.validate(wf);

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
    const badPorts = result.errors.map((e) => e.badPort).sort();
    expect(badPorts).toEqual(["main", "pending", "unknown"]);
  });

  it("error message is agent-readable", () => {
    const ifNode = makeNode("if-1", ["true", "false"]);
    ifNode.config.name = "If";
    const wf = workflow([ifNode], [makeEdge("if-1", "main", "if-1")]);

    const result = validator.validate(wf);

    expect(result.errors[0]!.message).toBe(
      'Edge from node "if-1" (kind "If") references undeclared output port "main". Allowed ports: ["true", "false"].',
    );
  });
});
