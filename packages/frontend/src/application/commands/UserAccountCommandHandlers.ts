

import type {
InviteUserResponseDto
} from "../contracts/userDirectoryContracts.types";


import { Command } from "../bus/Command";









export class InviteUserCommand extends Command<InviteUserResponseDto> {
  constructor(
    public readonly email: string,
    public readonly requestOrigin: string,
  ) {
    super();
  }
}

export { AcceptUserInviteCommand } from "./AcceptUserInviteCommand";
export { AcceptUserInviteCommandHandler } from "./AcceptUserInviteCommandHandler";
export { InviteUserCommandHandler } from "./InviteUserCommandHandler";
export { RegenerateUserInviteCommand } from "./RegenerateUserInviteCommand";
export { RegenerateUserInviteCommandHandler } from "./RegenerateUserInviteCommandHandler";
export { UpdateUserAccountStatusCommand } from "./UpdateUserAccountStatusCommand";
export { UpdateUserAccountStatusCommandHandler } from "./UpdateUserAccountStatusCommandHandler";
