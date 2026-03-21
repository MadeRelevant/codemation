import type { Query } from "./Query";

export interface QueryBus {
  execute<TResult>(query: Query<TResult>): Promise<TResult>;
}
