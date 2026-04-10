import { describe, expect, it } from "vitest";

import type { WorkflowDto } from "../../src/features/workflows/lib/realtime/workflowTypes";
import { layoutWorkflow } from "../../src/features/workflows/components/canvas/lib/layoutWorkflow";

describe("layoutWorkflow declared port union", () => {
  it("unions declared output ports with edge-derived ports (keeps declared ports even without edges)", () => {
    const wf: WorkflowDto = {
      id: "wf.test.declared-ports",
      name: "Declared ports",
      active: true,
      nodes: [
        {
          id: "node_1",
          kind: "node",
          type: "TestNode",
          declaredOutputPorts: ["main", "error"],
          declaredInputPorts: ["in"],
        },
      ],
      edges: [],
    };

    const { nodes } = layoutWorkflow(
      wf,
      {},
      [],
      {},
      new Map(),
      null,
      null,
      new Set(),
      false,
      false,
      new Set(),
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
      () => {},
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.data?.sourceOutputPorts).toEqual(["main", "error"]);
    expect(nodes[0]?.data?.targetInputPorts).toEqual(["in"]);
  });
});
