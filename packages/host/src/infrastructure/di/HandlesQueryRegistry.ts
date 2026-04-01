import { injectable } from "@codemation/core";
import type { Query } from "../../application/bus/Query";

type AbstractType<TInstance> = abstract new (...args: any[]) => TInstance;

export const queryHandlerMetadataKey = Symbol.for("codemation.infrastructure.di.QueryHandler");

export class HandlesQuery {
  static for<TQuery extends Query<TResult>, TResult>(queryType: AbstractType<TQuery>): ClassDecorator {
    return (target) => {
      Reflect.defineMetadata(queryHandlerMetadataKey, queryType, target);
      injectable()(target as never);
    };
  }
}
