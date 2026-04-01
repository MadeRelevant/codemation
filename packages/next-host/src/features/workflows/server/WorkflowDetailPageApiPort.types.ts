export interface WorkflowDetailPageApiPort {
  fetchWorkflowStatus(args: Readonly<{ workflowId: string; cookieHeader: string | null }>): Promise<number>;
}
