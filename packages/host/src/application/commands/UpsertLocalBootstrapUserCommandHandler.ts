import { inject } from "@codemation/core";

import type { UpsertLocalBootstrapUserResultDto } from "../contracts/userDirectoryContracts.types";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";
import { UpsertLocalBootstrapUserCommand } from "./UpsertLocalBootstrapUserCommand";

@HandlesCommand.forCommand(UpsertLocalBootstrapUserCommand)
export class UpsertLocalBootstrapUserCommandHandler extends CommandHandler<
  UpsertLocalBootstrapUserCommand,
  UpsertLocalBootstrapUserResultDto
> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: UpsertLocalBootstrapUserCommand): Promise<UpsertLocalBootstrapUserResultDto> {
    return await this.userAccounts.upsertBootstrapLocalUser(command.email, command.password);
  }
}
