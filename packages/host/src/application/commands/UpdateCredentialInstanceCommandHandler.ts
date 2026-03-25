import { inject } from "@codemation/core";

import type { CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UpdateCredentialInstanceCommand } from "./UpdateCredentialInstanceCommand";

import { CredentialInstanceService } from "../../domain/credentials/CredentialServices";

@HandlesCommand.forCommand(UpdateCredentialInstanceCommand)
export class UpdateCredentialInstanceCommandHandler extends CommandHandler<
  UpdateCredentialInstanceCommand,
  CredentialInstanceDto
> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: UpdateCredentialInstanceCommand): Promise<CredentialInstanceDto> {
    return await this.credentialInstanceService.update(command.instanceId, command.body);
  }
}
