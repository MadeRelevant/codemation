import { Query } from "../bus/Query";
import type { CollectionDetailDto } from "../contracts/CollectionContracts.types";

export class GetCollectionQuery extends Query<CollectionDetailDto | null> {
  constructor(public readonly name: string) {
    super();
  }
}
