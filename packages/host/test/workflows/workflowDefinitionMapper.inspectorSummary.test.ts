import { AllWorkflowsActiveWorkflowActivationPolicy, type WorkflowDefinition } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";

const mapper = new WorkflowDefinitionMapper(
  new WorkflowPolicyUiPresentationFactory(),
  new AllWorkflowsActiveWorkflowActivationPolicy(),
);

class TestNodeToken {}

function workflowWithNode(nodeConfig: Record<string, unknown>): WorkflowDefinition {
  return {
    id: "wf.test",
    name: "Test workflow",
    nodes: [
      {
        id: "node_1",
        kind: "node",
        type: TestNodeToken,
        config: nodeConfig as never,
      },
    ],
    edges: [],
  };
}

describe("WorkflowDefinitionMapper inspectorSummary", () => {
  it("maps inspectorSummary rows from a node config that implements the hook", () => {
    const dto = mapper.mapSync(
      workflowWithNode({
        inspectorSummary() {
          return [
            { label: "Method", value: "POST" },
            { label: "URL", value: "https://api.example.com/endpoint" },
          ];
        },
      }),
    );
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node?.inspectorSummary).toEqual([
      { label: "Method", value: "POST" },
      { label: "URL", value: "https://api.example.com/endpoint" },
    ]);
  });

  it("omits inspectorSummary when the hook is absent", () => {
    const dto = mapper.mapSync(workflowWithNode({}));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "inspectorSummary")).toBe(false);
  });

  it("omits inspectorSummary when the hook returns an empty array", () => {
    const dto = mapper.mapSync(
      workflowWithNode({
        inspectorSummary: () => [],
      }),
    );
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "inspectorSummary")).toBe(false);
  });

  it("filters out malformed rows (missing label / non-string value) without crashing", () => {
    const dto = mapper.mapSync(
      workflowWithNode({
        inspectorSummary() {
          return [
            { label: "Valid", value: "ok" },
            { value: "missing label" },
            { label: "Numeric value", value: 42 },
            { label: "  ", value: "blank label" },
          ];
        },
      }),
    );
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node?.inspectorSummary).toEqual([{ label: "Valid", value: "ok" }]);
  });

  it("skips inspectorSummary when the hook throws (workflow loading must not break)", () => {
    const dto = mapper.mapSync(
      workflowWithNode({
        inspectorSummary() {
          throw new Error("boom");
        },
      }),
    );
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "inspectorSummary")).toBe(false);
  });

  it("trims label whitespace but preserves value as-is (multi-line system prompts allowed)", () => {
    const dto = mapper.mapSync(
      workflowWithNode({
        inspectorSummary() {
          return [{ label: "  Prompt  ", value: "Line one\nLine two" }];
        },
      }),
    );
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node?.inspectorSummary).toEqual([{ label: "Prompt", value: "Line one\nLine two" }]);
  });
});
