import { Engine, inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import { WorkflowActivationPreflight } from "../../domain/workflows/WorkflowActivationPreflight";
import type { WorkflowActivationRepository } from "../../domain/workflows/WorkflowActivationRepository";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";
import { CommandHandler } from "../bus/CommandHandler";
import { SetWorkflowActivationCommand } from "./SetWorkflowActivationCommand";

@HandlesCommand.forCommand(SetWorkflowActivationCommand)
export class SetWorkflowActivationCommandHandler extends CommandHandler<
  SetWorkflowActivationCommand,
  Readonly<{ active: boolean }>
> {
  constructor(
    @inject(ApplicationTokens.WorkflowActivationRepository)
    private readonly workflowActivationRepository: WorkflowActivationRepository,
    @inject(RuntimeWorkflowActivationPolicy)
    private readonly workflowActivationPolicy: RuntimeWorkflowActivationPolicy,
    @inject(Engine)
    private readonly engine: Engine,
    @inject(WorkflowActivationPreflight)
    private readonly workflowActivationPreflight: WorkflowActivationPreflight,
  ) {
    super();
  }

  async execute(command: SetWorkflowActivationCommand): Promise<Readonly<{ active: boolean }>> {
    const workflowId = decodeURIComponent(command.workflowId);
    if (command.active) {
      await this.workflowActivationPreflight.assertCanActivate(command.workflowId);
    }
    await this.workflowActivationRepository.upsert(workflowId, command.active);
    this.workflowActivationPolicy.set(workflowId, command.active);
    await this.engine.syncWorkflowTriggersForActivation(workflowId);
    return { active: command.active };
  }
}
