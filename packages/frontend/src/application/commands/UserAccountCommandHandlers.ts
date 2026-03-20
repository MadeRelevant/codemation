import { inject } from "@codemation/core";
import type {
  InviteUserResponseDto,
  UserAccountDto,
  UserAccountStatus,
} from "../contracts/UserDirectoryContracts";
import { Command } from "../bus/Command";
import { CommandHandler } from "../bus/CommandHandler";
import { HandlesCommand } from "../../infrastructure/di/HandlesCommand";
import { UserAccountService } from "../../domain/users/UserAccountService";

export class InviteUserCommand extends Command<InviteUserResponseDto> {
  constructor(
    public readonly email: string,
    public readonly requestOrigin: string,
  ) {
    super();
  }
}

export class RegenerateUserInviteCommand extends Command<InviteUserResponseDto> {
  constructor(
    public readonly userId: string,
    public readonly requestOrigin: string,
  ) {
    super();
  }
}

export class AcceptUserInviteCommand extends Command<void> {
  constructor(
    public readonly token: string,
    public readonly password: string,
  ) {
    super();
  }
}

export class UpdateUserAccountStatusCommand extends Command<UserAccountDto> {
  constructor(
    public readonly userId: string,
    public readonly status: UserAccountStatus,
  ) {
    super();
  }
}

@HandlesCommand.for(InviteUserCommand)
export class InviteUserCommandHandler extends CommandHandler<InviteUserCommand, InviteUserResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: InviteUserCommand): Promise<InviteUserResponseDto> {
    return await this.userAccounts.inviteUser(command.email, command.requestOrigin);
  }
}

@HandlesCommand.for(RegenerateUserInviteCommand)
export class RegenerateUserInviteCommandHandler extends CommandHandler<RegenerateUserInviteCommand, InviteUserResponseDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: RegenerateUserInviteCommand): Promise<InviteUserResponseDto> {
    return await this.userAccounts.regenerateInvite(command.userId, command.requestOrigin);
  }
}

@HandlesCommand.for(AcceptUserInviteCommand)
export class AcceptUserInviteCommandHandler extends CommandHandler<AcceptUserInviteCommand, void> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: AcceptUserInviteCommand): Promise<void> {
    await this.userAccounts.acceptInvite(command.token, command.password);
  }
}

@HandlesCommand.for(UpdateUserAccountStatusCommand)
export class UpdateUserAccountStatusCommandHandler extends CommandHandler<UpdateUserAccountStatusCommand, UserAccountDto> {
  constructor(@inject(UserAccountService) private readonly userAccounts: UserAccountService) {
    super();
  }

  async execute(command: UpdateUserAccountStatusCommand): Promise<UserAccountDto> {
    return await this.userAccounts.updateAccountStatus(command.userId, command.status);
  }
}
