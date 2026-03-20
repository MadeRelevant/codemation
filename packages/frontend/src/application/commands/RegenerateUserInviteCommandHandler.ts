import { inject } from "@codemation/core";

import type {
InviteUserResponseDto
} from "../contracts/UserDirectoryContracts";


import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";

import { UserAccountService } from "../../domain/users/UserAccountService";
import { RegenerateUserInviteCommand } from "./RegenerateUserInviteCommand";



@HandlesCommand.for(RegenerateUserInviteCommand)
export class RegenerateUserInviteCommandHandler extends CommandHandler<RegenerateUserInviteCommand, InviteUserResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: RegenerateUserInviteCommand): Promise<InviteUserResponseDto> {
    return await this.userAccounts.regenerateInvite(command.userId, command.requestOrigin);
  }
}
