export type WorkflowNodeDto = Readonly<{
  id: string;
  kind: string;
  name?: string;
  type: string;
  role?: string;
  icon?: string;
  parentNodeId?: string;
  /** Short retry policy label for canvas/properties (e.g. fixed / exponential). */
  retryPolicySummary?: string;
  /** Whether this node declares a node-level error handler. */
  hasNodeErrorHandler?: boolean;
  /**
   * When true, empty main output batches still schedule single-input downstream nodes.
   * Shown on the canvas (e.g. fast-forward affordance).
   */
  continueWhenEmptyOutput?: boolean;
}>;

export type WorkflowEdgeDto = Readonly<{
  from: Readonly<{ nodeId: string; output: string }>;
  to: Readonly<{ nodeId: string; input: string }>;
}>;

export type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<WorkflowNodeDto>;
  edges: ReadonlyArray<WorkflowEdgeDto>;
  /** Workflow-level error hook configured on the definition. */
  hasWorkflowErrorHandler?: boolean;
}>;

export type WorkflowSummary = Readonly<{
  id: string;
  name: string;
  /** Path under workflow discovery root: folders + workflow file stem. */
  discoveryPathSegments: readonly string[];
}>;
