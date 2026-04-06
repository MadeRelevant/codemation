import type { DependencyContainer, InjectionToken } from "tsyringe";

import type { EngineExecutionLimitsPolicy } from "../policies";
import type { Container } from "../di";
import type { RunEventBus } from "../events/runEvents";
import type {
  CredentialSessionService,
  ExecutionContextFactory,
  Items,
  NodeExecutionScheduler,
  NodeOffloadPolicy,
  ParentExecutionRef,
  RunDataFactory,
  RunResult,
  TriggerSetupStateRepository,
  WorkflowExecutionRepository,
  WorkflowDefinition,
} from "../types";
import type { EngineRuntimeRegistrationOptions } from "../bootstrap/runtime/EngineRuntimeRegistration.types";
import type { Engine } from "../orchestration/Engine";
import type { InMemoryLiveWorkflowRepository } from "../runtime/InMemoryLiveWorkflowRepository";
import type { EngineWorkflowRunnerService } from "../runtime/EngineWorkflowRunnerService";
import type { RunIntentService } from "../runtime/RunIntentService";

import type { CapturingScheduler } from "./CapturingScheduler";

export type EngineTestKitOptions = Partial<{
  container: Container;
  providers: Map<InjectionToken<unknown>, unknown>;
  credentialSessions: CredentialSessionService;
  runStore: WorkflowExecutionRepository;
  scheduler: NodeExecutionScheduler;
  offloadPolicy: NodeOffloadPolicy;
  runDataFactory: RunDataFactory;
  executionContextFactory: ExecutionContextFactory;
  eventBus: RunEventBus;
  triggerSetupStateRepository: TriggerSetupStateRepository;
  webhookBasePath: string;
  makeRunId: () => string;
  makeActivationId: () => string;
  workflowRunner: EngineWorkflowRunnerService;
  /** Passed to engine factory so integration tests can assert host-configured limits propagate. */
  executionLimitsPolicy: EngineExecutionLimitsPolicy;
}>;

export type RegistrarEngineTestKitOptions = EngineTestKitOptions & {
  /** Passed to {@link EngineRuntimeRegistrar.register}. */
  registrarOptions?: EngineRuntimeRegistrationOptions;
};

export interface RegistrarEngineTestKitHandle {
  readonly engine: Engine;
  readonly runIntent: RunIntentService;
  readonly liveWorkflowRepository: InMemoryLiveWorkflowRepository;
  readonly runStore: WorkflowExecutionRepository;
  readonly triggerSetupStateRepository: TriggerSetupStateRepository;
  readonly scheduler: CapturingScheduler | NodeExecutionScheduler;
  readonly offloadPolicy: NodeOffloadPolicy;
  readonly workflowRunner: EngineWorkflowRunnerService;
  readonly dependencyContainer: DependencyContainer;
  start(workflows: ReadonlyArray<WorkflowDefinition>): Promise<void>;
  runToCompletion(args: {
    wf: WorkflowDefinition;
    startAt: string;
    items: Items;
    parent?: ParentExecutionRef;
  }): Promise<RunResult>;
  runIntentStartToCompletion(args: {
    wf: WorkflowDefinition;
    startAt: string;
    items: Items;
    parent?: ParentExecutionRef;
  }): Promise<RunResult>;
  readonly makeRunId: () => string;
  readonly makeActivationId: () => string;
}
