export class ApiPaths {
  static workflows(): string {
    return "/api/workflows";
  }

  static workflow(workflowId: string): string {
    return `/api/workflows/${encodeURIComponent(workflowId)}`;
  }

  static workflowRuns(workflowId: string): string {
    return `/api/workflows/${encodeURIComponent(workflowId)}/runs`;
  }

  static run(): string {
    return "/api/run";
  }

  static realtimeReady(): string {
    return "/api/realtime/ready";
  }

  static runState(runId: string): string {
    return `/api/runs/${encodeURIComponent(runId)}`;
  }

  static runWorkflowSnapshot(runId: string): string {
    return `/api/runs/${encodeURIComponent(runId)}/workflow-snapshot`;
  }

  static runNodePin(runId: string, nodeId: string): string {
    return `/api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/pin`;
  }

  static runNode(runId: string, nodeId: string): string {
    return `/api/runs/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/run`;
  }
}
