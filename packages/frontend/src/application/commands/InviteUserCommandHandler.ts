import { inject } from "@codemation/core";

import type {
InviteUserResponseDto
} from "../contracts/UserDirectoryContracts";


import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";

import { UserAccountService } from "../../domain/users/UserAccountService";

import { InviteUserCommand } from "./UserAccountCommandHandlers";



@HandlesCommand.for(InviteUserCommand)
export class InviteUserCommandHandler extends CommandHandler<InviteUserCommand, InviteUserResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: InviteUserCommand): Promise<InviteUserResponseDto> {
    return await this.userAccounts.inviteUser(command.email, command.requestOrigin);
  }
}
