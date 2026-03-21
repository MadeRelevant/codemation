import type { RunStateStore,WorkflowDefinition,WorkflowRepository } from "@codemation/core";
import { CoreTokens,Engine,inject,injectable } from "@codemation/core";
import { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";

@injectable()
export class WorkflowDefinitionRepositoryAdapter implements WorkflowDefinitionRepository {
  constructor(
    @inject(Engine) private readonly engine: Engine,
    @inject(CoreTokens.WorkflowRepository) private readonly workflowRepository: WorkflowRepository,
  ) {}

  async listDefinitions(): Promise<ReadonlyArray<WorkflowDefinition>> {
    return [...this.workflowRepository.list()];
  }

  async getDefinition(workflowId: string): Promise<WorkflowDefinition | undefined> {
    return this.workflowRepository.get(decodeURIComponent(workflowId));
  }

  async resolveSnapshot(args: Readonly<{ workflowId: string; workflowSnapshot?: unknown }>): Promise<WorkflowDefinition | undefined> {
    return this.engine.resolveWorkflowSnapshot({
      workflowId: decodeURIComponent(args.workflowId),
      workflowSnapshot: args.workflowSnapshot as NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["workflowSnapshot"],
    });
  }
}
