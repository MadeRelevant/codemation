import { instanceCachingFactory, type DependencyContainer } from "../../di";
import { CoreTokens } from "../../di";
import { EngineExecutionLimitsPolicyFactory } from "../../policies/executionLimits/EngineExecutionLimitsPolicyFactory";
import {
  DefaultAsyncSleeper,
  InProcessRetryRunnerFactory,
  ItemExprResolver,
  NodeExecutor,
  NodeExecutorFactory,
  NodeInstanceFactoryFactory,
  NodeOutputNormalizer,
  RunnableOutputBehaviorResolver,
} from "../../execution";
import {
  EngineFactory,
  EngineWorkflowRunnerServiceFactory,
  RunIntentServiceFactory,
  RunIntentService,
  WorkflowRepositoryWebhookTriggerMatcherFactory,
} from "../../runtime";
import { InlineDrivingScheduler } from "../../scheduler/InlineDrivingScheduler";
import { InlineDrivingSchedulerFactory } from "../../scheduler/InlineDrivingSchedulerFactory";
import { Engine } from "../../orchestration/Engine";
import type { EngineRuntimeRegistrationOptions } from "./EngineRuntimeRegistration.types";
import type { WebhookTriggerMatcherProvider } from "./EngineRuntimeRegistration.types";

/**
 * Container-first entry: call on a host/test container **after** workflow, run, node, and credential
 * ports are registered. The registrar owns the default inline scheduler, engine binding,
 * and intent-surface wiring so hosts only override the seams they actually replace.
 */
export class EngineRuntimeRegistrar {
  register(container: DependencyContainer, options?: EngineRuntimeRegistrationOptions): void {
    this.registerSupportFactories(container);
    this.registerExecutionLimitsPolicy(container, options);
    this.ensureWorkflowNodeInstanceFactory(container);
    this.ensureNodeExecutor(container);
    this.registerDefaultActivationScheduler(container);
    this.registerEngine(container, options);
    this.registerIntentServices(container);
  }

  private registerSupportFactories(container: DependencyContainer): void {
    if (!container.isRegistered(ItemExprResolver, true)) {
      container.registerSingleton(ItemExprResolver, ItemExprResolver);
    }
    if (!container.isRegistered(NodeOutputNormalizer, true)) {
      container.registerSingleton(NodeOutputNormalizer, NodeOutputNormalizer);
    }
    if (!container.isRegistered(RunnableOutputBehaviorResolver, true)) {
      container.registerSingleton(RunnableOutputBehaviorResolver, RunnableOutputBehaviorResolver);
    }
    container.registerSingleton(EngineExecutionLimitsPolicyFactory, EngineExecutionLimitsPolicyFactory);
    container.registerSingleton(NodeInstanceFactoryFactory, NodeInstanceFactoryFactory);
    container.registerSingleton(DefaultAsyncSleeper, DefaultAsyncSleeper);
    container.registerSingleton(InProcessRetryRunnerFactory, InProcessRetryRunnerFactory);
    container.registerSingleton(NodeExecutorFactory, NodeExecutorFactory);
    container.registerSingleton(InlineDrivingSchedulerFactory, InlineDrivingSchedulerFactory);
    container.registerSingleton(RunIntentServiceFactory, RunIntentServiceFactory);
    container.registerSingleton(EngineWorkflowRunnerServiceFactory, EngineWorkflowRunnerServiceFactory);
    container.registerSingleton(
      WorkflowRepositoryWebhookTriggerMatcherFactory,
      WorkflowRepositoryWebhookTriggerMatcherFactory,
    );
  }

  private registerExecutionLimitsPolicy(
    container: DependencyContainer,
    options: EngineRuntimeRegistrationOptions | undefined,
  ): void {
    if (container.isRegistered(CoreTokens.EngineExecutionLimitsPolicy, true)) {
      return;
    }
    container.register(CoreTokens.EngineExecutionLimitsPolicy, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const fromResolver = options?.resolveEngineExecutionLimits?.();
        const merged = fromResolver ?? options?.engineExecutionLimits;
        return dependencyContainer.resolve(EngineExecutionLimitsPolicyFactory).create(merged);
      }),
    });
  }

  private ensureWorkflowNodeInstanceFactory(container: DependencyContainer): void {
    if (container.isRegistered(CoreTokens.WorkflowNodeInstanceFactory, true)) {
      return;
    }
    container.register(CoreTokens.WorkflowNodeInstanceFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer
          .resolve(NodeInstanceFactoryFactory)
          .create(dependencyContainer.resolve(CoreTokens.NodeResolver));
      }),
    });
  }

  private ensureNodeExecutor(container: DependencyContainer): void {
    if (container.isRegistered(NodeExecutor, true)) {
      return;
    }
    container.register(NodeExecutor, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const retryRunner = dependencyContainer
          .resolve(InProcessRetryRunnerFactory)
          .create(dependencyContainer.resolve(DefaultAsyncSleeper));
        return dependencyContainer
          .resolve(NodeExecutorFactory)
          .create(
            dependencyContainer.resolve(CoreTokens.WorkflowNodeInstanceFactory),
            retryRunner,
            dependencyContainer.resolve(RunnableOutputBehaviorResolver),
          );
      }),
    });
  }

  private registerDefaultActivationScheduler(container: DependencyContainer): void {
    if (container.isRegistered(CoreTokens.NodeActivationScheduler, true)) {
      return;
    }
    container.register(InlineDrivingScheduler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer
          .resolve(InlineDrivingSchedulerFactory)
          .create(dependencyContainer.resolve(NodeExecutor));
      }),
    });
    container.register(CoreTokens.NodeActivationScheduler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer.resolve(InlineDrivingScheduler);
      }),
    });
  }

  private registerEngine(container: DependencyContainer, options: EngineRuntimeRegistrationOptions | undefined): void {
    container.registerSingleton(EngineFactory, EngineFactory);
    const matcherProvider = this.resolveMatcherProvider(options);
    container.register(Engine, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const liveWorkflowRepository = dependencyContainer.resolve(CoreTokens.LiveWorkflowRepository);
        const nodeResolver = dependencyContainer.resolve(CoreTokens.NodeResolver);
        const tokenRegistryLike = dependencyContainer.resolve(CoreTokens.PersistedWorkflowTokenRegistry);
        const workflowActivationPolicy = dependencyContainer.resolve(CoreTokens.WorkflowActivationPolicy);
        const webhookTriggerMatcher = matcherProvider.createMatcher(dependencyContainer);
        const workflowNodeInstanceFactory = dependencyContainer.resolve(CoreTokens.WorkflowNodeInstanceFactory);
        const triggerRuntimeDiagnostics = options?.triggerRuntimeDiagnosticsProvider?.create(dependencyContainer);
        return dependencyContainer.resolve(EngineFactory).create({
          credentialSessions: dependencyContainer.resolve(CoreTokens.CredentialSessionService),
          liveWorkflowRepository,
          workflowRepository: dependencyContainer.resolve(CoreTokens.WorkflowRepository),
          workflowActivationPolicy,
          nodeResolver,
          triggerSetupStateRepository: dependencyContainer.resolve(CoreTokens.TriggerSetupStateRepository),
          webhookTriggerMatcher,
          runIdFactory: dependencyContainer.resolve(CoreTokens.RunIdFactory),
          activationIdFactory: dependencyContainer.resolve(CoreTokens.ActivationIdFactory),
          workflowExecutionRepository: dependencyContainer.resolve(CoreTokens.WorkflowExecutionRepository),
          activationScheduler: dependencyContainer.resolve(CoreTokens.NodeActivationScheduler),
          runDataFactory: dependencyContainer.resolve(CoreTokens.RunDataFactory),
          executionContextFactory: dependencyContainer.resolve(CoreTokens.ExecutionContextFactory),
          nodeExecutor: dependencyContainer.resolve(NodeExecutor),
          eventBus: dependencyContainer.resolve(CoreTokens.RunEventBus),
          tokenRegistry: tokenRegistryLike,
          workflowNodeInstanceFactory,
          executionLimitsPolicy: dependencyContainer.resolve(CoreTokens.EngineExecutionLimitsPolicy),
          workflowPolicyRuntimeDefaults: options?.workflowPolicyRuntimeDefaults,
          triggerRuntimeDiagnostics,
        });
      }),
    });
  }

  private registerIntentServices(container: DependencyContainer): void {
    container.register(RunIntentService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer
          .resolve(RunIntentServiceFactory)
          .create(dependencyContainer.resolve(Engine), dependencyContainer.resolve(CoreTokens.WorkflowRepository));
      }),
    });
    container.register(CoreTokens.WorkflowRunnerService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        return dependencyContainer
          .resolve(EngineWorkflowRunnerServiceFactory)
          .create(dependencyContainer.resolve(Engine), dependencyContainer.resolve(CoreTokens.WorkflowRepository));
      }),
    });
  }

  private resolveMatcherProvider(options: EngineRuntimeRegistrationOptions | undefined): WebhookTriggerMatcherProvider {
    if (options?.webhookTriggerMatcherProvider) {
      return options.webhookTriggerMatcherProvider;
    }
    return {
      createMatcher: (container) =>
        container
          .resolve(WorkflowRepositoryWebhookTriggerMatcherFactory)
          .create(
            container.resolve(CoreTokens.WorkflowRepository),
            container.resolve(CoreTokens.WorkflowActivationPolicy),
            options?.webhookTriggerRoutingDiagnostics,
          ),
    };
  }
}
