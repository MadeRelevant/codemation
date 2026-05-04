import { Query } from "../bus/Query";
import type { ListCollectionRowsResponseDto } from "../contracts/CollectionContracts.types";

export class ListCollectionRowsQuery extends Query<ListCollectionRowsResponseDto> {
  constructor(
    public readonly name: string,
    public readonly limit: number,
    public readonly offset: number,
    public readonly where?: Readonly<Record<string, unknown>>,
  ) {
    super();
  }
}
