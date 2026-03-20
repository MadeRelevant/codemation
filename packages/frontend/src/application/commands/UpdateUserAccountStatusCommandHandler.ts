import { inject } from "@codemation/core";

import type {
UserAccountDto
} from "../contracts/UserDirectoryContracts";


import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";

import { UserAccountService } from "../../domain/users/UserAccountService";
import { UpdateUserAccountStatusCommand } from "./UpdateUserAccountStatusCommand";



@HandlesCommand.for(UpdateUserAccountStatusCommand)
export class UpdateUserAccountStatusCommandHandler extends CommandHandler<UpdateUserAccountStatusCommand, UserAccountDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: UpdateUserAccountStatusCommand): Promise<UserAccountDto> {
    return await this.userAccounts.updateAccountStatus(command.userId, command.status);
  }
}
