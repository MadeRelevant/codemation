import type { CredentialInstanceDto } from "../contracts/CredentialContractsRegistry";

import { Query } from "../bus/Query";

export class ListCredentialInstancesQuery extends Query<ReadonlyArray<CredentialInstanceDto>> {}
