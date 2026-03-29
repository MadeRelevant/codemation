import type { AnyCredentialType, Container, TypeToken, WorkflowDefinition } from "@codemation/core";
import type { AppConfig } from "./AppConfig";
import type { CodemationClassToken } from "./CodemationClassToken";

export interface CodemationRegistrationContextBase {
  readonly appConfig?: AppConfig;

  registerCredentialType(type: AnyCredentialType): void;
  registerNode<TValue>(token: TypeToken<TValue>, implementation?: CodemationClassToken<TValue>): void;
  registerValue<TValue>(token: TypeToken<TValue>, value: TValue): void;
  registerClass<TValue>(token: TypeToken<TValue>, implementation: CodemationClassToken<TValue>): void;
  registerFactory<TValue>(token: TypeToken<TValue>, factory: (container: Container) => TValue): void;
}

export interface CodemationAppContext extends CodemationRegistrationContextBase {
  registerWorkflow(workflow: WorkflowDefinition): void;
  registerWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void;
  discoverWorkflows(...directories: ReadonlyArray<string>): void;
}
