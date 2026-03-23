import { inject } from "@codemation/core";

import type {
UserAccountDto
} from "../contracts/userDirectoryContracts.types";


import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";
import { UpdateUserAccountStatusCommand } from "./UpdateUserAccountStatusCommand";



@HandlesCommand.forCommand(UpdateUserAccountStatusCommand)
export class UpdateUserAccountStatusCommandHandler extends CommandHandler<UpdateUserAccountStatusCommand, UserAccountDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: UpdateUserAccountStatusCommand): Promise<UserAccountDto> {
    return await this.userAccounts.updateAccountStatus(command.userId, command.status);
  }
}
