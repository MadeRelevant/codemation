import type { CreateCredentialInstanceRequest, CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { Command } from "../bus/Command";

export class CreateCredentialInstanceCommand extends Command<CredentialInstanceDto> {
  constructor(public readonly body: CreateCredentialInstanceRequest) {
    super();
  }
}
