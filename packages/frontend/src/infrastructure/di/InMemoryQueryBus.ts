import { injectAll,injectable } from "@codemation/core";
import type { Query } from "../../application/bus/Query";
import type { QueryBus } from "../../application/bus/QueryBus";
import type { QueryHandler } from "../../application/bus/QueryHandler";
import { ApplicationTokens } from "../../applicationTokens";
import { queryHandlerMetadataKey } from "./HandlesQuery";

type QueryType = abstract new (...args: any[]) => Query<unknown>;

@injectable()
export class InMemoryQueryBus implements QueryBus {
  private readonly handlersByQueryType: ReadonlyMap<QueryType, QueryHandler<Query<unknown>, unknown>>;

  constructor(
    @injectAll(ApplicationTokens.QueryHandler)
    handlers: ReadonlyArray<QueryHandler<Query<unknown>, unknown>>,
  ) {
    this.handlersByQueryType = this.createHandlersByQueryType(handlers);
  }

  async execute<TResult>(query: Query<TResult>): Promise<TResult> {
    const handler = this.handlersByQueryType.get(query.constructor as QueryType);
    if (!handler) {
      throw new Error(`No query handler registered for ${query.constructor.name}`);
    }
    return (await handler.execute(query as Query<unknown>)) as TResult;
  }

  private createHandlersByQueryType(
    handlers: ReadonlyArray<QueryHandler<Query<unknown>, unknown>>,
  ): ReadonlyMap<QueryType, QueryHandler<Query<unknown>, unknown>> {
    const handlersByQueryType = new Map<QueryType, QueryHandler<Query<unknown>, unknown>>();
    for (const handler of handlers) {
      const queryType = Reflect.getMetadata(queryHandlerMetadataKey, handler.constructor) as QueryType | undefined;
      if (!queryType) {
        throw new Error(`Query handler ${handler.constructor.name} is missing @HandlesQuery metadata.`);
      }
      if (handlersByQueryType.has(queryType)) {
        throw new Error(`Duplicate query handler registered for ${queryType.name}.`);
      }
      handlersByQueryType.set(queryType, handler);
    }
    return handlersByQueryType;
  }
}
