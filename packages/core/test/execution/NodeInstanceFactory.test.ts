import { describe, expect, it } from "vitest";
import type { NodeResolver } from "../../src/contracts/runtimeTypes.ts";
import type { WorkflowDefinition } from "../../src/types.ts";
import { NodeInstanceFactory } from "../../src/execution/NodeInstanceFactory.ts";
import { NodeInstantiationError } from "../../src/execution/NodeInstantiationError.ts";

class SuccessToken {}
class FailToken {}

class StubNodeResolver implements NodeResolver {
  resolve(type: unknown): unknown {
    if (type === FailToken) {
      throw new Error("simulated resolve failure");
    }
    return {};
  }
}

function makeWorkflow(nodeId: string, type: unknown): WorkflowDefinition {
  return {
    id: "test_wf",
    name: "Test Workflow",
    nodes: [
      {
        id: nodeId,
        kind: "node",
        type: type as WorkflowDefinition["nodes"][number]["type"],
        name: "Test Node",
      } as WorkflowDefinition["nodes"][number],
    ],
    edges: [],
  };
}

describe("NodeInstanceFactory.createNodes", () => {
  it("returns a map of node instances when resolution succeeds", () => {
    const factory = new NodeInstanceFactory(new StubNodeResolver());
    const result = factory.createNodes(makeWorkflow("node_1", SuccessToken));
    expect(result.has("node_1")).toBe(true);
  });

  it("throws NodeInstantiationError with correct nodeId when nodeResolver.resolve throws", () => {
    const factory = new NodeInstanceFactory(new StubNodeResolver());
    expect(() => factory.createNodes(makeWorkflow("failing_node", FailToken))).toThrow(NodeInstantiationError);
  });

  it("wraps cause error with correct nodeId and nodeType", () => {
    const factory = new NodeInstanceFactory(new StubNodeResolver());
    let caught: NodeInstantiationError | undefined;
    try {
      factory.createNodes(makeWorkflow("failing_node", FailToken));
    } catch (err) {
      if (err instanceof NodeInstantiationError) {
        caught = err;
      }
    }
    expect(caught).toBeDefined();
    expect(caught!.nodeId).toBe("failing_node");
    expect(caught!.nodeType).toBe("FailToken");
    expect(caught!.originalError).toBeInstanceOf(Error);
    expect(caught!.originalError.message).toBe("simulated resolve failure");
  });

  it("sets message to include nodeId, nodeType and original message", () => {
    const factory = new NodeInstanceFactory(new StubNodeResolver());
    let caught: NodeInstantiationError | undefined;
    try {
      factory.createNodes(makeWorkflow("failing_node", FailToken));
    } catch (err) {
      if (err instanceof NodeInstantiationError) {
        caught = err;
      }
    }
    expect(caught!.message).toContain("failing_node");
    expect(caught!.message).toContain("simulated resolve failure");
  });

  it("does not re-wrap an already-NodeInstantiationError", () => {
    class RethrowResolver implements NodeResolver {
      resolve(_type: unknown): unknown {
        throw new NodeInstantiationError("inner_node", "SomeType", new Error("inner"));
      }
    }
    const factory = new NodeInstanceFactory(new RethrowResolver());
    let caught: NodeInstantiationError | undefined;
    try {
      factory.createNodes(makeWorkflow("outer_node", SuccessToken));
    } catch (err) {
      if (err instanceof NodeInstantiationError) {
        caught = err;
      }
    }
    expect(caught!.nodeId).toBe("inner_node");
  });
});
