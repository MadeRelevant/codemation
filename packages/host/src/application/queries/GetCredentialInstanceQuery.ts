import type { CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { Query } from "../bus/Query";

export class GetCredentialInstanceQuery extends Query<CredentialInstanceDto | undefined> {
  constructor(public readonly instanceId: string) {
    super();
  }
}
