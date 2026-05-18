import { describe, it, expect } from "vitest";
import type { WorkflowDto, WorkflowNodeDto, WorkflowEdgeDto } from "@codemation/host/dto";
import { WorkflowElkPortInfoResolver } from "../../src/canvas-lib/elk/WorkflowElkPortInfoResolver";

function makeNode(id: string, opts: Partial<WorkflowNodeDto> = {}): WorkflowNodeDto {
  return { id, kind: "node", type: id, ...opts };
}

function makeEdge(fromNodeId: string, output: string, toNodeId: string): WorkflowEdgeDto {
  return { from: { nodeId: fromNodeId, output }, to: { nodeId: toNodeId, input: "in" } };
}

function makeWorkflow(nodes: WorkflowNodeDto[], edges: WorkflowEdgeDto[]): WorkflowDto {
  return { id: "wf", name: "Test", active: true, nodes, edges };
}

describe("WorkflowElkPortInfoResolver", () => {
  it("If node with rogue 'main' edge — only ['false','true'] rendered (regression test for the bug)", () => {
    const ifNode = makeNode("if-1", { declaredOutputPorts: ["true", "false"] });
    const nextNode = makeNode("next-1");
    const wf = makeWorkflow(
      [ifNode, nextNode],
      [
        // Rogue edge on an undeclared port — must NOT add 'main' to the port list.
        makeEdge("if-1", "main", "next-1"),
      ],
    );

    const portInfo = WorkflowElkPortInfoResolver.resolve(wf);

    const ifPorts = portInfo.get("if-1");
    expect(ifPorts).toBeDefined();
    // Port order: "true" (rank 0) before "false" (rank 1) per WorkflowCanvasPortOrderResolver.
    expect(ifPorts!.sourceOutputPorts).toEqual(["true", "false"]);
  });

  it("Switch dynamic cases — all case ports rendered", () => {
    const switchNode = makeNode("sw-1", { declaredOutputPorts: ["a", "b", "default"] });
    const wf = makeWorkflow(
      [switchNode],
      [makeEdge("sw-1", "a", "sw-1"), makeEdge("sw-1", "b", "sw-1"), makeEdge("sw-1", "default", "sw-1")],
    );

    const portInfo = WorkflowElkPortInfoResolver.resolve(wf);

    const swPorts = portInfo.get("sw-1");
    expect(swPorts).toBeDefined();
    expect(swPorts!.sourceOutputPorts).toEqual(["a", "b", "default"]);
  });

  it("declared node with hasNodeErrorHandler — 'error' port appended", () => {
    const ifNode = makeNode("if-1", { declaredOutputPorts: ["true", "false"], hasNodeErrorHandler: true });
    const wf = makeWorkflow([ifNode], []);

    const portInfo = WorkflowElkPortInfoResolver.resolve(wf);

    const ifPorts = portInfo.get("if-1");
    expect(ifPorts!.sourceOutputPorts).toContain("error");
    expect(ifPorts!.sourceOutputPorts).toContain("true");
    expect(ifPorts!.sourceOutputPorts).toContain("false");
    // Must not contain undeclared ports
    expect(ifPorts!.sourceOutputPorts).not.toContain("main");
  });

  it("legacy node without declaredOutputPorts — edge-inferred ports still appear", () => {
    const legacyNode = makeNode("legacy-1"); // no declaredOutputPorts
    const nextNode = makeNode("next-1");
    const wf = makeWorkflow(
      [legacyNode, nextNode],
      [makeEdge("legacy-1", "main", "next-1"), makeEdge("legacy-1", "extra", "next-1")],
    );

    const portInfo = WorkflowElkPortInfoResolver.resolve(wf);

    const legacyPorts = portInfo.get("legacy-1");
    expect(legacyPorts).toBeDefined();
    expect(legacyPorts!.sourceOutputPorts).toContain("main");
    expect(legacyPorts!.sourceOutputPorts).toContain("extra");
  });

  it("legacy node with no edges — defaults to ['main']", () => {
    const legacyNode = makeNode("legacy-1");
    const wf = makeWorkflow([legacyNode], []);

    const portInfo = WorkflowElkPortInfoResolver.resolve(wf);

    expect(portInfo.get("legacy-1")!.sourceOutputPorts).toEqual(["main"]);
  });
});
