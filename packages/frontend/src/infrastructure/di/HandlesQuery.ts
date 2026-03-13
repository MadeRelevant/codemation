import { injectable, registry } from "@codemation/core";
import type { QueryHandler } from "../../application/bus/QueryHandler";
import type { Query } from "../../application/bus/Query";
import { ApplicationTokens } from "../../applicationTokens";

type AbstractType<TInstance> = abstract new (...args: any[]) => TInstance;
type ConcreteType<TInstance> = new (...args: any[]) => TInstance;

export const queryHandlerMetadataKey = Symbol.for("codemation.infrastructure.di.QueryHandler");

export class HandlesQuery {
  static for<TQuery extends Query<TResult>, TResult>(queryType: AbstractType<TQuery>): ClassDecorator {
    return (target) => {
      Reflect.defineMetadata(queryHandlerMetadataKey, queryType, target);
      injectable()(target as never);
      registry([
        {
          token: ApplicationTokens.QueryHandler,
          useClass: target as unknown as ConcreteType<QueryHandler<Query<unknown>, unknown>>,
        },
      ])(target as never);
    };
  }
}
