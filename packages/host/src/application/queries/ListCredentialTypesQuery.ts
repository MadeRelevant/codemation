import type { CredentialTypeDefinition } from "@codemation/core";

import { Query } from "../bus/Query";

export class ListCredentialTypesQuery extends Query<ReadonlyArray<CredentialTypeDefinition>> {}
