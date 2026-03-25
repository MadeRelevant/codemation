import { inject } from "@codemation/core";

import type { InviteUserResponseDto } from "../contracts/userDirectoryContracts.types";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";
import { RegenerateUserInviteCommand } from "./RegenerateUserInviteCommand";

@HandlesCommand.forCommand(RegenerateUserInviteCommand)
export class RegenerateUserInviteCommandHandler extends CommandHandler<
  RegenerateUserInviteCommand,
  InviteUserResponseDto
> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: RegenerateUserInviteCommand): Promise<InviteUserResponseDto> {
    return await this.userAccounts.regenerateInvite(command.userId, command.requestOrigin);
  }
}
