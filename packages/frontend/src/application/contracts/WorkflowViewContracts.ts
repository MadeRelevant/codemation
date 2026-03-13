export type WorkflowNodeDto = Readonly<{
  id: string;
  kind: string;
  name?: string;
  type: string;
  role?: string;
  icon?: string;
  parentNodeId?: string;
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
}>;

export type WorkflowSummary = Readonly<{ id: string; name: string }>;
