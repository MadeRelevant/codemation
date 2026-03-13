import { injectable, registry } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { HttpRouteHandler } from "./HttpRouteHandler";

type ConcreteType<TInstance> = new (...args: any[]) => TInstance;

export class HandlesHttpRoute {
  static for(): ClassDecorator {
    return (target) => {
      injectable()(target as never);
      registry([
        {
          token: ApplicationTokens.HttpRouteHandler,
          useClass: target as unknown as ConcreteType<HttpRouteHandler>,
        },
      ])(target as never);
    };
  }
}
