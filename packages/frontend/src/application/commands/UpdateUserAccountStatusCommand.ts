
import type {
UserAccountDto,
UserAccountStatus
} from "../contracts/UserDirectoryContracts";

import { Command } from "../bus/Command";






export class UpdateUserAccountStatusCommand extends Command<UserAccountDto> {
  constructor(
    public readonly userId: string,
    public readonly status: UserAccountStatus,
  ) {
    super();
  }
}
