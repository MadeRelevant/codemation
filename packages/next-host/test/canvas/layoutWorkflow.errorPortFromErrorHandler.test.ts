import { describe, expect, it } from "vitest";

import type { WorkflowDto } from "../../src/features/workflows/lib/realtime/workflowTypes";
import { layoutWorkflow } from "../../src/features/workflows/components/canvas/lib/layoutWorkflow";

describe("layoutWorkflow error port from node error handler", () => {
  it("adds error output port when hasNodeErrorHandler is true (keeps main default)", () => {
    const wf: WorkflowDto = {
      id: "wf.test.error-port-from-handler",
      name: "Error port from handler",
      active: true,
      nodes: [
        {
          id: "node_1",
          kind: "node",
          type: "TestNode",
          hasNodeErrorHandler: true,
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
  });
});
