import { inject } from "@codemation/core";

import { CommandHandler } from "../bus/CommandHandler";

import { HandlesCommand } from "../../infrastructure/di/HandlesCommandRegistry";

import { UserAccountService } from "../../domain/users/UserAccountServiceRegistry";
import { AcceptUserInviteCommand } from "./AcceptUserInviteCommand";

@HandlesCommand.forCommand(AcceptUserInviteCommand)
export class AcceptUserInviteCommandHandler extends CommandHandler<AcceptUserInviteCommand, void> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: AcceptUserInviteCommand): Promise<void> {
    await this.userAccounts.acceptInvite(command.token, command.password);
  }
}
