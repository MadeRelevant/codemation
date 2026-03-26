export type WorkflowActivationRow = Readonly<{
  workflowId: string;
  isActive: boolean;
}>;

export interface WorkflowActivationRepository {
  loadAll(): Promise<ReadonlyArray<WorkflowActivationRow>>;
  upsert(workflowId: string, active: boolean): Promise<void>;
}
