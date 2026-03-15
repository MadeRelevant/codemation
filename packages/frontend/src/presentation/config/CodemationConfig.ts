import type { Container, CredentialService, TypeToken, WorkflowDefinition } from "@codemation/core";
import type { CodemationApplication } from "../../codemationApplication";
import type { CodemationApplicationRuntimeConfig } from "../../infrastructure/runtime/CodemationRuntimeConfig";
import type { CodemationAppSlots } from "./CodemationAppSlots";
import type { CodemationBinding } from "./CodemationBinding";
import type { CodemationWorkflowDiscovery } from "./CodemationWorkflowDiscovery";

export interface CodemationBootContext {
  readonly application: CodemationApplication;
  readonly container: Container;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discoveredWorkflows: ReadonlyArray<WorkflowDefinition>;
  readonly workflowSources: ReadonlyArray<string>;
}

export interface CodemationBootHook {
  boot(context: CodemationBootContext): void | Promise<void>;
}

export interface CodemationConfig {
  readonly credentials?: CredentialService;
  readonly runtime?: CodemationApplicationRuntimeConfig;
  readonly workflows?: ReadonlyArray<WorkflowDefinition>;
  readonly workflowDiscovery?: CodemationWorkflowDiscovery;
  readonly bindings?: ReadonlyArray<CodemationBinding<unknown>>;
  readonly bootHook?: TypeToken<CodemationBootHook>;
  readonly slots?: CodemationAppSlots;
}
