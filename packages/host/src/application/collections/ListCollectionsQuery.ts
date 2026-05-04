import { Query } from "../bus/Query";
import type { CollectionSummaryDto } from "../contracts/CollectionContracts.types";

export class ListCollectionsQuery extends Query<ReadonlyArray<CollectionSummaryDto>> {}
