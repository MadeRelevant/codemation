

import type {
CredentialInstanceDto
} from "../contracts/CredentialContracts";

import { Query } from "../bus/Query";






export class ListCredentialInstancesQuery extends Query<ReadonlyArray<CredentialInstanceDto>> {}
