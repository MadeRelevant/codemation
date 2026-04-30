export class CodemationTelemetryAttributeNames {
  static readonly workflowId = "codemation.workflow.id";
  static readonly runId = "codemation.run.id";
  static readonly nodeId = "codemation.node.id";
  static readonly activationId = "codemation.activation.id";
  static readonly nodeType = "codemation.node.type";
  static readonly nodeRole = "codemation.node.role";
  static readonly workflowFolder = "codemation.workflow.folder";
  static readonly connectionInvocationId = "codemation.connection.invocation_id";
  static readonly toolName = "codemation.tool.name";
  static readonly traceParentRunId = "codemation.parent.run.id";
  /** Per-item iteration that emitted this span/metric. Set on spans recorded inside a runnable per-item loop. */
  static readonly iterationId = "codemation.iteration.id";
  /** Item index (0-based) of the iteration. */
  static readonly iterationIndex = "codemation.iteration.index";
  /** Set when this span/metric was recorded under a sub-agent triggered by an outer LLM/tool call. */
  static readonly parentInvocationId = "codemation.parent.invocation_id";
}
