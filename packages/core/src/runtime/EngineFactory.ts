import type { EngineDeps } from "../types";

import { MissingRuntimeFallbacks } from "../workflowSnapshots/MissingRuntimeFallbacksFactory";
import { MissingRuntimeExecutionMarker } from "../workflowSnapshots/MissingRuntimeExecutionMarker";
import { WorkflowSnapshotCodec } from "../workflowSnapshots/WorkflowSnapshotCodec";
import { WorkflowSnapshotResolver } from "../workflowSnapshots/WorkflowSnapshotResolver";
import { ActivationEnqueueService } from "../execution/ActivationEnqueueService";
import { NodeActivationRequestInputPreparer } from "../execution/NodeActivationRequestInputPreparer";
import { NodeActivationRequestComposer } from "../execution/NodeActivationRequestComposer";
import { PersistedRunStateTerminalBuilder } from "../execution/PersistedRunStateTerminalBuilder";
import { NodeExecutionRequestHandlerService } from "../orchestration/NodeExecutionRequestHandlerService";
import { RunContinuationService } from "../orchestration/RunContinuationService";
import { RunStartService } from "../orchestration/RunStartService";
import { RunStateSemantics } from "../execution/RunStateSemantics";
import { WorkflowRunExecutionContextFactory } from "../execution/WorkflowRunExecutionContextFactory";
import { RunTerminalPersistenceCoordinator } from "../policies/storage/RunTerminalPersistenceCoordinator";
import { WorkflowPolicyErrorServices } from "../policies/WorkflowPolicyErrorServices";
import { WorkflowStoragePolicyEvaluator } from "../policies/storage/WorkflowStoragePolicyEvaluator";
import { NodeEventPublisher } from "../events/NodeEventPublisher";
import { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import { EngineWorkflowPlanningFactory } from "../planning/EngineWorkflowPlanningFactory";
import { TriggerRuntimeService } from "../orchestration/TriggerRuntimeService";
import { EngineWaiters } from "../orchestration/EngineWaiters";
import { Engine } from "../orchestration/Engine";
import { CredentialResolverFactory } from "../execution/CredentialResolverFactory";
import { NodeRunStateWriterFactory } from "../execution/NodeRunStateWriterFactory";

/**
 * {@link EngineDeps} plus optional overrides for workflow-snapshot materialization.
 * Overrides keep default construction in this factory while allowing tests or advanced wiring to inject instances.
 */
export type EngineCompositionDeps = EngineDeps & {
  workflowSnapshotCodec?: WorkflowSnapshotCodec;
  missingRuntimeFallbacks?: MissingRuntimeFallbacks;
  /** When set, used for run-start, trigger, and continuation limit defaults. */
  executionLimitsPolicy?: EngineExecutionLimitsPolicy;
};

/**
 * Composes the {@link Engine} graph from {@link EngineCompositionDeps}. Production wiring usually goes through
 * {@link import("../bootstrap/runtime/EngineRuntimeRegistrar").EngineRuntimeRegistrar}; this factory remains for tests and custom composition.
 * Exported from `@codemation/core/bootstrap` (not the main `@codemation/core` barrel).
 */
export class EngineFactory {
  create(deps: EngineCompositionDeps): Engine {
    const waiters = new EngineWaiters();
    const credentialResolverFactory = new CredentialResolverFactory(deps.credentialSessions);
    const nodeEventPublisher = new NodeEventPublisher(deps.eventBus);
    const nodeStatePublisherFactory = new NodeRunStateWriterFactory(
      deps.workflowExecutionRepository,
      nodeEventPublisher,
      deps.eventBus,
    );
    const planningFactory = new EngineWorkflowPlanningFactory(deps.workflowNodeInstanceFactory);
    const executionLimitsPolicy = deps.executionLimitsPolicy ?? new EngineExecutionLimitsPolicy();
    const workflowSnapshotCodec = deps.workflowSnapshotCodec ?? new WorkflowSnapshotCodec(deps.tokenRegistry);
    const missingRuntimeFallbacks = deps.missingRuntimeFallbacks ?? new MissingRuntimeFallbacks();
    const workflowSnapshotResolver = new WorkflowSnapshotResolver(
      deps.workflowRepository,
      deps.tokenRegistry,
      workflowSnapshotCodec,
      missingRuntimeFallbacks,
    );

    const semantics = new RunStateSemantics(new MissingRuntimeExecutionMarker());
    const nodeActivationRequestInputPreparer = new NodeActivationRequestInputPreparer(deps.workflowNodeInstanceFactory);
    const activationEnqueueService = new ActivationEnqueueService(
      deps.activationScheduler,
      deps.workflowExecutionRepository,
      nodeEventPublisher,
      nodeActivationRequestInputPreparer,
    );
    const runExecutionContextFactory = new WorkflowRunExecutionContextFactory(
      deps.executionContextFactory,
      credentialResolverFactory,
    );
    const nodeActivationRequestComposer = new NodeActivationRequestComposer(
      deps.activationIdFactory,
      credentialResolverFactory,
    );
    const persistedRunStateTerminalBuilder = new PersistedRunStateTerminalBuilder();
    const storagePolicyEvaluator = new WorkflowStoragePolicyEvaluator(deps.nodeResolver);
    const terminalPersistence = new RunTerminalPersistenceCoordinator(
      deps.workflowExecutionRepository,
      storagePolicyEvaluator,
    );
    const policyErrorServices = new WorkflowPolicyErrorServices(deps.nodeResolver);

    const runStartService = new RunStartService(
      deps.runIdFactory,
      deps.workflowExecutionRepository,
      deps.runDataFactory,
      workflowSnapshotCodec,
      planningFactory,
      nodeStatePublisherFactory,
      runExecutionContextFactory,
      nodeActivationRequestComposer,
      activationEnqueueService,
      semantics,
      waiters,
      deps.workflowPolicyRuntimeDefaults,
      executionLimitsPolicy,
    );
    const runContinuationService = new RunContinuationService(
      deps.activationIdFactory,
      deps.workflowExecutionRepository,
      deps.runDataFactory,
      runExecutionContextFactory,
      workflowSnapshotResolver,
      planningFactory,
      nodeStatePublisherFactory,
      credentialResolverFactory,
      nodeActivationRequestComposer,
      persistedRunStateTerminalBuilder,
      activationEnqueueService,
      nodeEventPublisher,
      semantics,
      waiters,
      policyErrorServices,
      terminalPersistence,
      executionLimitsPolicy,
    );
    const nodeExecutionRequestHandler = new NodeExecutionRequestHandlerService(
      deps.workflowExecutionRepository,
      workflowSnapshotResolver,
      deps.runDataFactory,
      runExecutionContextFactory,
      nodeStatePublisherFactory,
      nodeActivationRequestComposer,
      deps.nodeExecutor,
      runContinuationService,
      executionLimitsPolicy,
    );

    const triggerRuntime = new TriggerRuntimeService(
      deps.workflowRepository,
      deps.workflowActivationPolicy,
      deps.runIdFactory,
      deps.runDataFactory,
      deps.executionContextFactory,
      credentialResolverFactory,
      nodeStatePublisherFactory,
      deps.nodeResolver,
      deps.triggerSetupStateRepository,
      {
        emit: async (workflow, triggerNodeId, items) => {
          await runStartService.runWorkflow(workflow, triggerNodeId, items, undefined);
        },
      },
      executionLimitsPolicy,
      deps.triggerRuntimeDiagnostics,
    );

    const engine = new Engine({
      liveWorkflowRepository: deps.liveWorkflowRepository,
      tokenRegistry: deps.tokenRegistry,
      webhookTriggerMatcher: deps.webhookTriggerMatcher,
      workflowSnapshotResolver,
      triggerRuntime,
      runStartService,
      runContinuationService,
      nodeExecutionRequestHandler,
    });

    deps.activationScheduler.setContinuation?.(engine);
    return engine;
  }
}
