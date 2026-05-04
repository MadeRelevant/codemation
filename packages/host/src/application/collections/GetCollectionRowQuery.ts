import { Query } from "../bus/Query";
import type { CollectionRowDto } from "../contracts/CollectionContracts.types";

export class GetCollectionRowQuery extends Query<CollectionRowDto | null> {
  constructor(
    public readonly name: string,
    public readonly id: string,
  ) {
    super();
  }
}
