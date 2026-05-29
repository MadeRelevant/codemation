import type { AppsResponse } from "../contracts/CredentialContractsRegistry";
import { Query } from "../bus/Query";

export class GetCredentialAppsQuery extends Query<AppsResponse> {}
