import type { DependencyContainer, InjectionToken } from "tsyringe";
import { container as tsyringeContainer } from "tsyringe";

import type { WorkflowRunnerService } from "../contracts/runtimeTypes";
import { CoreTokens } from "../di";
import { InMemoryRunEventBus } from "../events/InMemoryRunEventBusRegistry";
import { AllWorkflowsActiveWorkflowActivationPolicy } from "../contracts/workflowActivationPolicy";
import { RunIntentService } from "../runtime/RunIntentService";
import {
  DefaultDrivingScheduler,
  DefaultAsyncSleeper,
  DefaultExecutionContextFactory,
  Engine,
  EngineRuntimeRegistrar,
  EngineWorkflowRunnerService,
  HintOnlyOffloadPolicy,
  InProcessRetryRunner,
  InMemoryRunDataFactory,
  InMemoryWorkflowExecutionRepository,
  InlineDrivingScheduler,
  NodeExecutor,
  NodeInstanceFactory,
  PersistedWorkflowTokenRegistry,
} from "../bootstrap/index";
import { InMemoryLiveWorkflowRepository } from "../runtime/InMemoryLiveWorkflowRepository";
import { EngineTestKitRunIdFactory } from "./EngineTestKitRunIdFactory";
import { InMemoryTriggerSetupStateRepository } from "./InMemoryTriggerSetupStateRepository";
import { RejectingCredentialSessionService } from "./RejectingCredentialSessionService";
import { CapturingScheduler } from "./CapturingScheduler";
import { PrefixedSequentialIdGenerator } from "./PrefixedSequentialIdGenerator";
import type { RegistrarEngineTestKitHandle, RegistrarEngineTestKitOptions } from "./RegistrarEngineTestKit.types";
import { ItemHarnessNode } from "./ItemHarnessNode";
import { SubWorkflowRunnerNode } from "./SubWorkflowRunnerTestNode";
import { WorkflowTestHarnessManualTriggerNode } from "./WorkflowTestHarnessManualTrigger";

export class RegistrarEngineTestKitFactory {
  static create(options: RegistrarEngineTestKitOptions = {}): RegistrarEngineTestKitHandle {
    const runStore = options.runStore ?? new InMemoryWorkflowExecutionRepository();
    const scheduler = options.scheduler ?? new CapturingScheduler();
    const offloadPolicy = options.offloadPolicy ?? new HintOnlyOffloadPolicy();
    const runIdGen = new PrefixedSequentialIdGenerator("run_");
    const activationIdGen = new PrefixedSequentialIdGenerator("act_");
    const makeRunId = options.makeRunId ?? runIdGen.asFn();
    const makeActivationId = options.makeActivationId ?? activationIdGen.asFn();
    const credentialSessions = options.credentialSessions ?? new RejectingCredentialSessionService();
    const eventBus = options.eventBus ?? new InMemoryRunEventBus();
    const triggerSetupStateRepository =
      options.triggerSetupStateRepository ?? new InMemoryTriggerSetupStateRepository();
    const liveWorkflowRepository = new InMemoryLiveWorkflowRepository();
    const runDataFactory = options.runDataFactory ?? new InMemoryRunDataFactory();
    const executionContextFactory = options.executionContextFactory ?? new DefaultExecutionContextFactory();
    const container = options.container ?? tsyringeContainer.createChildContainer();
    const dependencyContainer = container as DependencyContainer;
    const nodeResolver = container;
    const nodeExecutor = new NodeExecutor(
      new NodeInstanceFactory(nodeResolver),
      new InProcessRetryRunner(new DefaultAsyncSleeper()),
    );
    const activationScheduler = new DefaultDrivingScheduler(
      offloadPolicy,
      scheduler,
      new InlineDrivingScheduler(nodeExecutor),
    );

    for (const [token, value] of options.providers ?? new Map<InjectionToken<unknown>, unknown>()) {
      dependencyContainer.registerInstance(token, value);
    }

    dependencyContainer.registerInstance(CoreTokens.CredentialSessionService, credentialSessions);
    dependencyContainer.registerInstance(CoreTokens.LiveWorkflowRepository, liveWorkflowRepository);
    dependencyContainer.registerInstance(CoreTokens.WorkflowRepository, liveWorkflowRepository);
    dependencyContainer.registerInstance(CoreTokens.NodeResolver, nodeResolver);
    dependencyContainer.registerInstance(
      CoreTokens.RunIdFactory,
      new EngineTestKitRunIdFactory(makeRunId, makeActivationId),
    );
    dependencyContainer.registerInstance(
      CoreTokens.ActivationIdFactory,
      new EngineTestKitRunIdFactory(makeRunId, makeActivationId),
    );
    dependencyContainer.registerInstance(CoreTokens.WebhookBasePath, options.webhookBasePath ?? "/webhooks");
    dependencyContainer.registerInstance(CoreTokens.WorkflowExecutionRepository, runStore);
    dependencyContainer.registerInstance(CoreTokens.TriggerSetupStateRepository, triggerSetupStateRepository);
    dependencyContainer.registerInstance(CoreTokens.NodeActivationScheduler, activationScheduler);
    dependencyContainer.registerInstance(CoreTokens.RunDataFactory, runDataFactory);
    dependencyContainer.registerInstance(CoreTokens.ExecutionContextFactory, executionContextFactory);
    dependencyContainer.registerInstance(CoreTokens.RunEventBus, eventBus);
    dependencyContainer.registerInstance(
      CoreTokens.PersistedWorkflowTokenRegistry,
      new PersistedWorkflowTokenRegistry(),
    );
    dependencyContainer.registerInstance(
      CoreTokens.WorkflowActivationPolicy,
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    );

    if (options.executionLimitsPolicy !== undefined) {
      dependencyContainer.registerInstance(CoreTokens.EngineExecutionLimitsPolicy, options.executionLimitsPolicy);
    }

    new EngineRuntimeRegistrar().register(dependencyContainer, options.registrarOptions ?? {});

    const engine = dependencyContainer.resolve(Engine);
    const runIntent = dependencyContainer.resolve(RunIntentService);
    const workflowRunner =
      options.workflowRunner ??
      (dependencyContainer.resolve(CoreTokens.WorkflowRunnerService) as EngineWorkflowRunnerService);
    dependencyContainer.registerInstance(
      SubWorkflowRunnerNode,
      new SubWorkflowRunnerNode(workflowRunner as WorkflowRunnerService),
    );
    dependencyContainer.registerInstance(ItemHarnessNode, new ItemHarnessNode());
    dependencyContainer.registerInstance(
      WorkflowTestHarnessManualTriggerNode,
      new WorkflowTestHarnessManualTriggerNode(),
    );

    const start = async (workflows: ReadonlyArray<import("../types").WorkflowDefinition>): Promise<void> => {
      await engine.start([...workflows]);
    };

    const runToCompletion: RegistrarEngineTestKitHandle["runToCompletion"] = async (args) => {
      const r0 = await engine.runWorkflow(args.wf, args.startAt, args.items, args.parent);
      if (r0.status !== "pending") return r0;
      return await engine.waitForCompletion(r0.runId);
    };

    const runIntentStartToCompletion: RegistrarEngineTestKitHandle["runIntentStartToCompletion"] = async (args) => {
      const r0 = await runIntent.startWorkflow({
        workflow: args.wf,
        startAt: args.startAt,
        items: args.items,
        parent: args.parent,
      });
      if (r0.status !== "pending") return r0;
      return await engine.waitForCompletion(r0.runId);
    };

    return {
      engine,
      runIntent,
      liveWorkflowRepository,
      runStore,
      triggerSetupStateRepository,
      scheduler: scheduler as CapturingScheduler | import("../types").NodeExecutionScheduler,
      offloadPolicy,
      workflowRunner,
      dependencyContainer,
      start,
      runToCompletion,
      runIntentStartToCompletion,
      makeRunId,
      makeActivationId,
    };
  }
}
