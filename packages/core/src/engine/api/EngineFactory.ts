import type { EngineDeps } from "../../types";

import { CurrentStateFrontierPlannerFactory } from "../application/planning/CurrentStateFrontierPlannerFactory";
import { MissingRuntimeNodeDefinitionFactory } from "../adapters/persisted-workflow/MissingRuntimeNodeDefinitionFactory";
import { PersistedWorkflowConfigHydrator } from "../adapters/persisted-workflow/PersistedWorkflowConfigHydrator";
import { PersistedWorkflowResolver } from "../adapters/persisted-workflow/PersistedWorkflowResolver";
import { PersistedWorkflowSnapshotFactory } from "../adapters/persisted-workflow/PersistedWorkflowSnapshotFactory";
import { ActivationEnqueueService } from "../application/execution/ActivationEnqueueService";
import { CurrentStateRunStarter } from "../application/execution/CurrentStateRunStarter";
import { RunContinuationService } from "../application/execution/RunContinuationService";
import { RunStateSemantics } from "../application/execution/RunStateSemantics";
import { WorkflowRunStarter } from "../application/execution/WorkflowRunStarter";
import { CredentialResolverFactory } from "../application/credentials/CredentialResolverFactory";
import { NodeEventPublisher } from "../application/events/NodeEventPublisher";
import { EngineWorkflowPlanningFactory } from "../application/planning/EngineWorkflowPlanningFactory";
import { NodeExecutionStatePublisherFactory } from "../application/state/NodeExecutionStatePublisherFactory";
import { TriggerRuntimeService } from "../application/triggers/TriggerRuntimeService";
import { EngineWaiters } from "../application/waiters/EngineWaiters";

import { Engine } from "./Engine";

/**
 * {@link EngineDeps} plus optional overrides for persisted-workflow materialization.
 * Overrides keep default construction in this factory while allowing tests or advanced wiring to inject instances.
 */
export type EngineCompositionDeps = EngineDeps & {
  persistedWorkflowConfigHydrator?: PersistedWorkflowConfigHydrator;
  missingRuntimeNodeDefinitionFactory?: MissingRuntimeNodeDefinitionFactory;
};

export class EngineFactory {
  create(deps: EngineCompositionDeps): Engine {
    const waiters = new EngineWaiters();
    const credentialResolverFactory = new CredentialResolverFactory(deps.credentialSessions);
    const nodeEventPublisher = new NodeEventPublisher(deps.eventBus);
    const nodeStatePublisherFactory = new NodeExecutionStatePublisherFactory(deps.runStore, nodeEventPublisher);
    const planningFactory = new EngineWorkflowPlanningFactory(deps.workflowNodeInstanceFactory);
    const workflowSnapshotFactory = new PersistedWorkflowSnapshotFactory(deps.tokenRegistry);
    const persistedWorkflowConfigHydrator =
      deps.persistedWorkflowConfigHydrator ?? new PersistedWorkflowConfigHydrator(deps.tokenRegistry);
    const missingRuntimeNodeDefinitionFactory =
      deps.missingRuntimeNodeDefinitionFactory ?? new MissingRuntimeNodeDefinitionFactory();
    const workflowSnapshotResolver = new PersistedWorkflowResolver(
      deps.workflowRepository,
      deps.tokenRegistry,
      persistedWorkflowConfigHydrator,
      missingRuntimeNodeDefinitionFactory,
    );

    const semantics = new RunStateSemantics();
    const activationEnqueueService = new ActivationEnqueueService(deps.activationScheduler, deps.runStore, nodeEventPublisher);

    const workflowRunStarter = new WorkflowRunStarter(
      deps.runIdFactory,
      deps.activationIdFactory,
      deps.runStore,
      deps.runDataFactory,
      deps.executionContextFactory,
      workflowSnapshotFactory,
      planningFactory,
      nodeStatePublisherFactory,
      credentialResolverFactory,
      activationEnqueueService,
      waiters,
    );
    const currentStateRunStarter = new CurrentStateRunStarter(
      deps.runIdFactory,
      deps.activationIdFactory,
      deps.runStore,
      deps.runDataFactory,
      deps.executionContextFactory,
      workflowSnapshotFactory,
      planningFactory,
      new CurrentStateFrontierPlannerFactory(),
      nodeStatePublisherFactory,
      credentialResolverFactory,
      activationEnqueueService,
      semantics,
      waiters,
    );
    const runContinuationService = new RunContinuationService(
      deps.activationIdFactory,
      deps.runStore,
      deps.runDataFactory,
      deps.executionContextFactory,
      workflowSnapshotResolver,
      planningFactory,
      nodeStatePublisherFactory,
      credentialResolverFactory,
      activationEnqueueService,
      deps.nodeActivationObserver,
      nodeEventPublisher,
      semantics,
      waiters,
    );

    const webhookBasePath = deps.webhookBasePath ?? "/webhooks";
    const triggerRuntime = new TriggerRuntimeService(
      deps.workflowRepository,
      deps.runIdFactory,
      deps.runDataFactory,
      deps.executionContextFactory,
      credentialResolverFactory,
      nodeStatePublisherFactory,
      deps.nodeResolver,
      deps.triggerSetupStateStore,
      deps.webhookRegistrar,
      deps.webhookTriggerMatcher,
      webhookBasePath,
      {
        emit: async (workflow, triggerNodeId, items) => {
          await workflowRunStarter.runWorkflow(workflow, triggerNodeId, items, undefined);
        },
      },
    );

    const engine = new Engine({
      workflowCatalog: deps.workflowCatalog,
      tokenRegistry: deps.tokenRegistry,
      webhookTriggerMatcher: deps.webhookTriggerMatcher,
      workflowSnapshotResolver,
      triggerRuntime,
      workflowRunStarter,
      currentStateRunStarter,
      runContinuationService,
    });

    deps.activationScheduler.setContinuation?.(engine);
    return engine;
  }
}

