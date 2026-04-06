import type { DependencyContainer } from "tsyringe";

import type { TypeToken } from "../di";

import type { DefinedNodeRegistrationContext } from "./WorkflowTestKit.types";

export class WorkflowTestKitNodeRegistrationContextFactory {
  create(dependencyContainer: DependencyContainer): DefinedNodeRegistrationContext {
    return {
      registerNode<TValue>(token: TypeToken<TValue>, implementation?: TypeToken<TValue>) {
        dependencyContainer.register(token, {
          useClass: (implementation ?? token) as never,
        });
      },
    };
  }
}
