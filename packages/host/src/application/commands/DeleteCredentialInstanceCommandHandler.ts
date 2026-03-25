import { inject } from "@codemation/core";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { DeleteCredentialInstanceCommand } from "./DeleteCredentialInstanceCommand";

import { CredentialInstanceService } from "../../domain/credentials/CredentialServices";

@HandlesCommand.forCommand(DeleteCredentialInstanceCommand)
export class DeleteCredentialInstanceCommandHandler extends CommandHandler<
  DeleteCredentialInstanceCommand,
  Readonly<{ ok: true }>
> {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
  ) {
    super();
  }

  async execute(command: DeleteCredentialInstanceCommand): Promise<Readonly<{ ok: true }>> {
    await this.credentialInstanceService.delete(command.instanceId);
    return { ok: true };
  }
}
