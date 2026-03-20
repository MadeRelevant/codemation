



import type {
CreateCredentialInstanceRequest,
CredentialInstanceDto
} from "../contracts/CredentialContracts";


import { Command } from "../bus/Command";









export class CreateCredentialInstanceCommand extends Command<CredentialInstanceDto> {
  constructor(public readonly body: CreateCredentialInstanceRequest) {
    super();
  }
}

export { CreateCredentialInstanceCommandHandler } from "./CreateCredentialInstanceCommandHandler";
export { DeleteCredentialInstanceCommand } from "./DeleteCredentialInstanceCommand";
export { DeleteCredentialInstanceCommandHandler } from "./DeleteCredentialInstanceCommandHandler";
export { TestCredentialInstanceCommand } from "./TestCredentialInstanceCommand";
export { TestCredentialInstanceCommandHandler } from "./TestCredentialInstanceCommandHandler";
export { UpdateCredentialInstanceCommand } from "./UpdateCredentialInstanceCommand";
export { UpdateCredentialInstanceCommandHandler } from "./UpdateCredentialInstanceCommandHandler";
export { UpsertCredentialBindingCommand } from "./UpsertCredentialBindingCommand";
export { UpsertCredentialBindingCommandHandler } from "./UpsertCredentialBindingCommandHandler";
