import type { UserAccountDto } from "../contracts/userDirectoryContracts.types";

import { Query } from "../bus/Query";

export class ListUserAccountsQuery extends Query<ReadonlyArray<UserAccountDto>> {}
