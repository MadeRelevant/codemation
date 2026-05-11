import { describe, expect, it } from "vitest";

import type { WorkflowDto } from "@codemation/canvas";
import { layoutWorkflow } from "@codemation/canvas";

describe("layoutWorkflow declared port union", () => {
  it("unions declared output ports with edge-derived ports (keeps declared ports even without edges)", async () => {
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

    const { nodes } = await layoutWorkflow(
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
