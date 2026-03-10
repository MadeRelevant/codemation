import type { Container, CredentialService, TypeToken, WorkflowDefinition } from "@codemation/core";
import type { CodemationApplication } from "../codemationApplication";
import type { CodemationApplicationRuntimeConfig } from "../runtime/codemationRuntimeConfig";

export interface CodemationBootstrapContext {
  readonly application: CodemationApplication;
  readonly container: Container;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly discoveredWorkflows: ReadonlyArray<WorkflowDefinition>;
  readonly workflowSources: ReadonlyArray<string>;
}

export interface CodemationBootHook {
  boot(context: CodemationBootstrapContext): void | Promise<void>;
}

export interface CodemationDiscoveryOptions {
  readonly workflowSource?: "convention" | "config-only";
  readonly consumerModuleRoots?: ReadonlyArray<string>;
}

export interface CodemationBootstrapResult {
  readonly credentials?: CredentialService;
  readonly runtime?: CodemationApplicationRuntimeConfig;
  readonly workflows?: ReadonlyArray<WorkflowDefinition>;
  readonly workflowMode?: "augment" | "replace";
  readonly bootHook?: TypeToken<CodemationBootHook>;
  readonly discovery?: CodemationDiscoveryOptions;
}

export type CodemationConfig = CodemationBootstrapResult;

export interface CodemationBootstrapDiscoveryArgs {
  readonly application: CodemationApplication;
  readonly consumerRoot: string;
  readonly repoRoot: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly bootstrapPathOverride?: string;
  readonly workflowsDirectoryOverride?: string;
}

export interface CodemationDiscoveredApplicationSetup {
  readonly application: CodemationApplication;
  readonly bootstrapSource: string | null;
  readonly workflowSources: ReadonlyArray<string>;
}
