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
  /** When true, downstream nodes may run even when this node outputs zero items. */
  continueWhenEmptyOutput?: boolean;
  /** Declared I/O ports from node config (unioned with ports inferred from edges on the canvas). */
  declaredOutputPorts?: ReadonlyArray<string>;
  declaredInputPorts?: ReadonlyArray<string>;
}>;

export type WorkflowEdgeDto = Readonly<{
  from: Readonly<{ nodeId: string; output: string }>;
  to: Readonly<{ nodeId: string; input: string }>;
}>;

export type WorkflowDto = Readonly<{
  id: string;
  name: string;
  /** When true, trigger setup runs and webhooks are registered for this workflow. */
  active: boolean;
  nodes: ReadonlyArray<WorkflowNodeDto>;
  edges: ReadonlyArray<WorkflowEdgeDto>;
  /** Workflow-level error hook configured on the definition. */
  hasWorkflowErrorHandler?: boolean;
}>;

export type WorkflowSummary = Readonly<{
  id: string;
  name: string;
  /** When true, trigger setup runs and webhooks are registered for this workflow. */
  active: boolean;
  /** Path under workflow discovery root: folders + workflow file stem. */
  discoveryPathSegments: readonly string[];
}>;
