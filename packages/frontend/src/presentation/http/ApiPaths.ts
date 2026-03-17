export class ApiPaths {
  private static readonly apiBasePath = "/api";

  private static readonly workflowsBasePath = `${this.apiBasePath}/workflows`;

  private static readonly runsBasePath = `${this.apiBasePath}/runs`;

  private static readonly webhooksBasePath = `${this.apiBasePath}/webhooks`;

  static workflows(): string {
    return this.workflowsBasePath;
  }

  static workflow(workflowId: string): string {
    return `${this.workflowsBasePath}/${encodeURIComponent(workflowId)}`;
  }

  static workflowRuns(workflowId: string): string {
    return `${this.workflow(workflowId)}/runs`;
  }

  static workflowDebuggerOverlay(workflowId: string): string {
    return `${this.workflow(workflowId)}/debugger-overlay`;
  }

  static workflowDebuggerOverlayCopyRun(workflowId: string): string {
    return `${this.workflowDebuggerOverlay(workflowId)}/copy-run`;
  }

  static runs(): string {
    return this.runsBasePath;
  }

  static run(): string {
    return this.runs();
  }

  static workflowWebsocket(): string {
    return `${this.workflowsBasePath}/ws`;
  }

  static webhooks(): string {
    return this.webhooksBasePath;
  }

  static runState(runId: string): string {
    return `${this.runsBasePath}/${encodeURIComponent(runId)}`;
  }

  static runWorkflowSnapshot(runId: string): string {
    return `${this.runState(runId)}/workflow-snapshot`;
  }

  static runNodePin(runId: string, nodeId: string): string {
    return `${this.runState(runId)}/nodes/${encodeURIComponent(nodeId)}/pin`;
  }

  static runNode(runId: string, nodeId: string): string {
    return `${this.runState(runId)}/nodes/${encodeURIComponent(nodeId)}/run`;
  }

  static runBinaryContent(runId: string, binaryId: string): string {
    return `${this.runState(runId)}/binary/${encodeURIComponent(binaryId)}/content`;
  }
}
