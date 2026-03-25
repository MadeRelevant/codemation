import type { CredentialBinding } from "@codemation/core";

import { inject } from "@codemation/core";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UpsertCredentialBindingCommand } from "./UpsertCredentialBindingCommand";

import { CredentialBindingService } from "../../domain/credentials/CredentialServices";

@HandlesCommand.forCommand(UpsertCredentialBindingCommand)
export class UpsertCredentialBindingCommandHandler extends CommandHandler<
  UpsertCredentialBindingCommand,
  CredentialBinding
> {
  constructor(
    @inject(CredentialBindingService)
    private readonly credentialBindingService: CredentialBindingService,
  ) {
    super();
  }

  async execute(command: UpsertCredentialBindingCommand): Promise<CredentialBinding> {
    return await this.credentialBindingService.upsertBinding(command.body);
  }
}
