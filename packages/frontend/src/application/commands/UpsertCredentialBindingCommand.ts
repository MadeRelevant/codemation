import type { CredentialBinding } from "@codemation/core";


import type {
UpsertCredentialBindingRequest
} from "../contracts/CredentialContracts";

import { Command } from "../bus/Command";






export class UpsertCredentialBindingCommand extends Command<CredentialBinding> {
  constructor(public readonly body: UpsertCredentialBindingRequest) {
    super();
  }
}
