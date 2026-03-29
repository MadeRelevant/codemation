import { CoreTokens } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import type { WorkerRuntimeHandle } from "../../infrastructure/runtime/WorkerRuntimeScheduler";
import { PrismaMigrationDeployer } from "../../infrastructure/persistence/PrismaMigrationDeployer";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { ApplicationTokens } from "../../applicationTokens";
import { ApiPaths } from "../../presentation/http/ApiPaths";
import { PreparedCodemationRuntime } from "../PreparedCodemationRuntime";

export class WorkerRuntimeBootService {
  async boot(
    args: Readonly<{
      preparedRuntime: PreparedCodemationRuntime;
      queues: ReadonlyArray<string>;
    }>,
  ): Promise<Readonly<{ stop: () => Promise<void> }>> {
    await this.applyDatabaseMigrations(args.preparedRuntime);
    await args.preparedRuntime.container
      .resolve(RuntimeWorkflowActivationPolicy)
      .hydrateFromRepository(args.preparedRuntime.container.resolve(ApplicationTokens.WorkflowActivationRepository));
    args.preparedRuntime.container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
    if (!args.preparedRuntime.container.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
      throw new Error("Worker mode requires a BullMQ scheduler backed by a Redis event bus.");
    }
    const workflows = args.preparedRuntime.container.resolve(CoreTokens.WorkflowRepository).list();
    const engine = args.preparedRuntime.container.resolve(Engine);
    await engine.start([...workflows]);
    const workflowsById = new Map(workflows.map((workflow) => [workflow.id, workflow] as const));
    const scheduler = args.preparedRuntime.container.resolve(ApplicationTokens.WorkerRuntimeScheduler);
    const executionLimitsPolicy = args.preparedRuntime.container.resolve(CoreTokens.EngineExecutionLimitsPolicy);
    const worker: WorkerRuntimeHandle = scheduler.createWorker({
      queues: args.queues,
      workflowsById,
      nodeResolver: args.preparedRuntime.container.resolve(CoreTokens.NodeResolver),
      credentialSessions: args.preparedRuntime.container.resolve(CoreTokens.CredentialSessionService),
      workflowExecutionRepository: args.preparedRuntime.container.resolve(CoreTokens.WorkflowExecutionRepository),
      continuation: engine,
      binaryStorage: args.preparedRuntime.container.resolve(CoreTokens.BinaryStorage),
      workflows: args.preparedRuntime.container.resolve(CoreTokens.WorkflowRunnerService),
      executionLimitsPolicy,
    });
    return {
      stop: async () => {
        await worker.stop();
        await scheduler.close();
        await args.preparedRuntime.stop({ stopWebsocketServer: false });
      },
    };
  }

  private async applyDatabaseMigrations(preparedRuntime: PreparedCodemationRuntime): Promise<void> {
    const appConfig = preparedRuntime.container.resolve(ApplicationTokens.AppConfig);
    if (
      preparedRuntime.implementationSelection.databasePersistence.kind === "none" ||
      preparedRuntime.usesProvidedPrismaClientOverride ||
      appConfig.env.CODEMATION_SKIP_STARTUP_MIGRATIONS === "true"
    ) {
      return;
    }
    await preparedRuntime.container
      .resolve(PrismaMigrationDeployer)
      .deployPersistence(preparedRuntime.implementationSelection.databasePersistence, appConfig.env);
  }
}
