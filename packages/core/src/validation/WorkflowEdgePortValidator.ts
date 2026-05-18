import type { Edge, NodeDefinition } from "../contracts/workflowTypes";
import type { WorkflowEdgePortError, WorkflowEdgePortValidationResult } from "./WorkflowEdgePortError.types";

export class WorkflowEdgePortValidator {
  validate(workflow: {
    nodes: ReadonlyArray<NodeDefinition>;
    edges: ReadonlyArray<Edge>;
  }): WorkflowEdgePortValidationResult {
    const nodeById = new Map<string, NodeDefinition>();
    for (const node of workflow.nodes) {
      nodeById.set(node.id, node);
    }

    const errors: WorkflowEdgePortError[] = [];

    for (const edge of workflow.edges) {
      const sourceNode = nodeById.get(edge.from.nodeId);
      const allowedPorts = this.allowedOutputPorts(sourceNode);
      if (allowedPorts !== null && !allowedPorts.includes(edge.from.output)) {
        const nodeKind = sourceNode?.config.name ?? sourceNode?.name;
        const message = `Edge from node "${edge.from.nodeId}"${nodeKind ? ` (kind "${nodeKind}")` : ""} references undeclared output port "${edge.from.output}". Allowed ports: [${allowedPorts.map((p) => `"${p}"`).join(", ")}].`;
        errors.push({
          edge,
          sourceNodeId: edge.from.nodeId,
          sourceNodeName: sourceNode?.name,
          sourceNodeKind: nodeKind,
          badPort: edge.from.output,
          allowedPorts,
          message,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Returns the declared output ports for a node, or null if the node is
   * unknown / has no declared ports (legacy nodes — treat as unconstrained).
   */
  private allowedOutputPorts(node: NodeDefinition | undefined): ReadonlyArray<string> | null {
    if (!node) {
      return null;
    }
    const declared = node.config.declaredOutputPorts;
    if (declared && declared.length > 0) {
      return declared as string[];
    }
    // No declared ports — treat as unconstrained (legacy nodes default to "main").
    return null;
  }
}
