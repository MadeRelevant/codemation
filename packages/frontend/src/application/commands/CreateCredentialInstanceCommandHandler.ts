
import { inject } from "@codemation/core";

import type {
CredentialInstanceDto
} from "../contracts/CredentialContractsRegistry";


import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import {
CredentialInstanceService
} from "../../domain/credentials/CredentialServices";

import { CreateCredentialInstanceCommand } from "./CredentialCommandHandlers";



@HandlesCommand.for(CreateCredentialInstanceCommand)
export class CreateCredentialInstanceCommandHandler extends CommandHandler<CreateCredentialInstanceCommand, CredentialInstanceDto> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: CreateCredentialInstanceCommand): Promise<CredentialInstanceDto> {
    return await this.credentialInstanceService.create(command.body);
  }
}
