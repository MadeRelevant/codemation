import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";

import { layoutWorkflow } from "../../../src/features/workflows/components/canvas/lib/layoutWorkflow";
import type { WorkflowCanvasNodeData } from "../../../src/features/workflows/components/canvas/lib/workflowCanvasNodeData";
import type { WorkflowDto } from "../../../src/features/workflows/lib/realtime/workflowTypes";

export type LaidOutCanvasGraph = Readonly<{
  nodes: ReactFlowNode<WorkflowCanvasNodeData>[];
  edges: ReactFlowEdge[];
}>;

/**
 * Runs the real `layoutWorkflow` pipeline (ELK layered → React Flow mapping)
 * with inert defaults for every runtime-state argument, so tests can focus on
 * the **layout invariants** — positions, dimensions, edge handle/type wiring —
 * without reproducing the 17-arg call boilerplate in every file.
 *
 * All callbacks default to no-ops. All "ambient" state (snapshots, pinned
 * nodes, live-workflow flags) is empty/off so layout is deterministic.
 */
export class LayoutWorkflowTestKit {
  static async run(workflow: WorkflowDto): Promise<LaidOutCanvasGraph> {
    const noop = () => {};
    return layoutWorkflow(
      workflow,
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
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );
  }
}
