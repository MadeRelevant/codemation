

import type {
CredentialInstanceDto,
UpdateCredentialInstanceRequest
} from "../contracts/CredentialContracts";

import { Command } from "../bus/Command";






export class UpdateCredentialInstanceCommand extends Command<CredentialInstanceDto> {
  constructor(
    public readonly instanceId: string,
    public readonly body: UpdateCredentialInstanceRequest,
  ) {
    super();
  }
}
