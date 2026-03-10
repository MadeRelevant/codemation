import type { Container } from "../../di";
import { CoreTokens } from "../../diTokens";
import type { WorkflowRunnerResolver, WorkflowRunnerService } from "../../types";

export class ContainerWorkflowRunnerResolver implements WorkflowRunnerResolver {
  constructor(private readonly container: Container) {}

  resolve(): WorkflowRunnerService | undefined {
    if (!this.container.isRegistered(CoreTokens.WorkflowRunnerService, true)) {
      return undefined;
    }
    return this.container.resolve<WorkflowRunnerService>(CoreTokens.WorkflowRunnerService);
  }
}
