import type { Edge, NodeId, OutputPortKey } from "../contracts/workflowTypes";

export interface WorkflowEdgePortError {
  readonly edge: Edge;
  readonly sourceNodeId: NodeId;
  readonly sourceNodeName: string | undefined;
  readonly sourceNodeKind: string | undefined;
  readonly badPort: OutputPortKey;
  readonly allowedPorts: ReadonlyArray<string>;
  readonly message: string;
}

export interface WorkflowEdgePortValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<WorkflowEdgePortError>;
}
