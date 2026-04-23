import type { WorkflowDto } from "../../../../lib/realtime/workflowTypes";
import { WorkflowCanvasPortOrderResolver } from "../WorkflowCanvasPortOrderResolver";

export type WorkflowElkPortInfo = Readonly<{
  sourceOutputPorts: readonly string[];
  targetInputPorts: readonly string[];
}>;

/**
 * Unions declared ports (from the node config) with ports inferred from edges,
 * appending the synthetic `"error"` output whenever a node declares a node-level
 * error handler. This is the same union the old `layoutWorkflow` computed
 * inline; centralised so the ELK graph builder and the result mapper emit
 * identical port lists.
 */
export class WorkflowElkPortInfoResolver {
  static resolve(workflow: WorkflowDto): Map<string, WorkflowElkPortInfo> {
    const outgoingByNodeId = new Map<string, Set<string>>();
    const incomingByNodeId = new Map<string, Set<string>>();
    for (const edge of workflow.edges) {
      if (!outgoingByNodeId.has(edge.from.nodeId)) outgoingByNodeId.set(edge.from.nodeId, new Set());
      outgoingByNodeId.get(edge.from.nodeId)!.add(edge.from.output);
      if (!incomingByNodeId.has(edge.to.nodeId)) incomingByNodeId.set(edge.to.nodeId, new Set());
      incomingByNodeId.get(edge.to.nodeId)!.add(edge.to.input);
    }

    const out = new Map<string, WorkflowElkPortInfo>();
    for (const node of workflow.nodes) {
      const fromEdgesOut = [...(outgoingByNodeId.get(node.id) ?? [])];
      const declaredOut = node.declaredOutputPorts ?? [];
      const baseOut = [...new Set([...declaredOut, ...fromEdgesOut])];
      const combinedOut =
        baseOut.length > 0
          ? [...new Set([...baseOut, ...(node.hasNodeErrorHandler ? ["error"] : [])])]
          : node.hasNodeErrorHandler
            ? (["main", "error"] as const)
            : (["main"] as const);
      const sourceOutputPorts = WorkflowCanvasPortOrderResolver.sortSourceOutputs(combinedOut);

      const fromEdgesIn = [...(incomingByNodeId.get(node.id) ?? [])];
      const declaredIn = node.declaredInputPorts ?? [];
      const combinedIn = [...new Set([...declaredIn, ...fromEdgesIn])];
      const targetInputPorts = WorkflowCanvasPortOrderResolver.sortTargetInputs(
        combinedIn.length > 0 ? combinedIn : ["in"],
      );

      out.set(node.id, { sourceOutputPorts, targetInputPorts });
    }
    return out;
  }
}
