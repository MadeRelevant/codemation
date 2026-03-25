import type { UpsertLocalBootstrapUserResultDto } from "../contracts/userDirectoryContracts.types";

import { Command } from "../bus/Command";

export class UpsertLocalBootstrapUserCommand extends Command<UpsertLocalBootstrapUserResultDto> {
  constructor(
    public readonly email: string,
    public readonly password: string,
  ) {
    super();
  }
}
