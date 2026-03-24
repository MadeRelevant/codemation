import type { WorkflowDefinition } from "../../../types";

type NodeId = string;
type VisitState = "unvisited" | "visiting" | "done";

/**
 * Rejects workflow definitions whose edges contain a directed cycle (including self-loops).
 */
export class DirectedCycleDetector {
  validateAcyclic(workflow: WorkflowDefinition): void {
    const outgoing = this.buildOutgoingAdjacency(workflow);
    const state = new Map<NodeId, VisitState>();
    for (const n of workflow.nodes) {
      state.set(n.id, "unvisited");
    }
    for (const n of workflow.nodes) {
      if (state.get(n.id) === "unvisited") {
        this.depthFirstSearch(n.id, outgoing, state);
      }
    }
  }

  private buildOutgoingAdjacency(workflow: WorkflowDefinition): ReadonlyMap<NodeId, ReadonlyArray<NodeId>> {
    const map = new Map<NodeId, NodeId[]>();
    for (const e of workflow.edges) {
      const list = map.get(e.from.nodeId) ?? [];
      list.push(e.to.nodeId);
      map.set(e.from.nodeId, list);
    }
    return map;
  }

  private depthFirstSearch(nodeId: NodeId, outgoing: ReadonlyMap<NodeId, ReadonlyArray<NodeId>>, visitState: Map<NodeId, VisitState>): void {
    visitState.set(nodeId, "visiting");
    for (const toId of outgoing.get(nodeId) ?? []) {
      const s = visitState.get(toId);
      if (s === "visiting") {
        throw new Error(`Workflow graph contains a directed cycle (edge ${nodeId} -> ${toId}).`);
      }
      if (s === "unvisited") {
        this.depthFirstSearch(toId, outgoing, visitState);
      }
    }
    visitState.set(nodeId, "done");
  }
}
