import type { Query } from "./Query";

export abstract class QueryHandler<TQuery extends Query<TResult>, TResult> {
  abstract execute(query: TQuery): Promise<TResult>;
}
