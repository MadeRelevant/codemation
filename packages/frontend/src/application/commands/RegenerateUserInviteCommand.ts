
import type {
InviteUserResponseDto
} from "../contracts/UserDirectoryContracts";

import { Command } from "../bus/Command";






export class RegenerateUserInviteCommand extends Command<InviteUserResponseDto> {
  constructor(
    public readonly userId: string,
    public readonly requestOrigin: string,
  ) {
    super();
  }
}
