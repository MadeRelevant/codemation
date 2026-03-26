import { Command } from "../bus/Command";

export class SetWorkflowActivationCommand extends Command<Readonly<{ active: boolean }>> {
  constructor(
    public readonly workflowId: string,
    public readonly active: boolean,
  ) {
    super();
  }
}
