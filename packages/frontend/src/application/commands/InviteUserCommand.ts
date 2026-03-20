import type { InviteUserResponseDto } from "../contracts/userDirectoryContracts.types";

import { Command } from "../bus/Command";

export class InviteUserCommand extends Command<InviteUserResponseDto> {
  constructor(
    public readonly email: string,
    public readonly requestOrigin: string,
  ) {
    super();
  }
}
