import type { RunStateStore, WorkflowDefinition, WorkflowRegistry } from "@codemation/core";
import { inject, injectable, CoreTokens, Engine } from "@codemation/core";
import { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";

@injectable()
export class WorkflowDefinitionRepositoryAdapter implements WorkflowDefinitionRepository {
  constructor(
    @inject(Engine) private readonly engine: Engine,
    @inject(CoreTokens.WorkflowRegistry) private readonly workflowRegistry: WorkflowRegistry,
  ) {}

  async listDefinitions(): Promise<ReadonlyArray<WorkflowDefinition>> {
    return [...this.workflowRegistry.list()];
  }

  async getDefinition(workflowId: string): Promise<WorkflowDefinition | undefined> {
    return this.workflowRegistry.get(decodeURIComponent(workflowId));
  }

  async resolveSnapshot(args: Readonly<{ workflowId: string; workflowSnapshot?: unknown }>): Promise<WorkflowDefinition | undefined> {
    return this.engine.resolveWorkflowSnapshot({
      workflowId: decodeURIComponent(args.workflowId),
      workflowSnapshot: args.workflowSnapshot as NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"],
    });
  }
}
