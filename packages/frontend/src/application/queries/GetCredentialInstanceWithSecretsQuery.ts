

import type {
CredentialInstanceWithSecretsDto
} from "../contracts/CredentialContracts";

import { Query } from "../bus/Query";






export class GetCredentialInstanceWithSecretsQuery extends Query<CredentialInstanceWithSecretsDto | undefined> {
  constructor(public readonly instanceId: string) {
    super();
  }
}
