/**
 * Workspace-local audit emitter contract.
 * Mirror of the CP-side IAuditEmitter shape; kept separate to avoid cross-repo coupling.
 */
export interface WorkflowAuditActor {
  readonly userId: string;
  readonly sessionId?: string;
}

export interface WorkflowAuditResource {
  readonly type: string;
  readonly id: string;
}

export interface WorkflowAuditEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: WorkflowAuditActor;
  readonly action: string;
  readonly resource: WorkflowAuditResource;
  readonly outcome: "success" | "failure";
  readonly errorCode?: string;
  readonly correlationId?: string;
  /** Denormalised on every row for query convenience. */
  readonly workflowId: string;
  readonly runId?: string;
  readonly nodeId?: string;
}

export interface IWorkflowAuditEmitter {
  emit(entry: WorkflowAuditEntry): Promise<void>;
}
