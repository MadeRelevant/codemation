import type { WorkflowRepository } from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import type {
  WorkerRuntimeHandle,
  WorkerRuntimeScheduler,
} from "../../infrastructure/scheduler/WorkerRuntimeScheduler";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import type { WorkflowActivationRepository } from "../../domain/workflows/WorkflowActivationRepository";
import { DatabaseMigrations } from "./DatabaseMigrations";
import { AppContainerLifecycle } from "../AppContainerLifecycle";
import { RunEventBusTelemetryReporter } from "../../application/telemetry/RunEventBusTelemetryReporter";
import { WorkflowRunRetentionPruneScheduler } from "../../application/runs/WorkflowRunRetentionPruneScheduler";

@injectable()
export class WorkerRuntime {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(DatabaseMigrations)
    private readonly databaseMigrations: DatabaseMigrations,
    @inject(RuntimeWorkflowActivationPolicy)
    private readonly runtimeWorkflowActivationPolicy: RuntimeWorkflowActivationPolicy,
    @inject(ApplicationTokens.WorkflowActivationRepository)
    private readonly workflowActivationRepository: WorkflowActivationRepository,
    @inject(CoreTokens.WorkflowRepository)
    private readonly workflowRepository: WorkflowRepository,
    @inject(Engine)
    private readonly engine: Engine,
    @inject(RunEventBusTelemetryReporter)
    private readonly runEventBusTelemetryReporter: RunEventBusTelemetryReporter,
    @inject(WorkflowRunRetentionPruneScheduler)
    private readonly workflowRunRetentionPruneScheduler: WorkflowRunRetentionPruneScheduler,
    @inject(ApplicationTokens.WorkerRuntimeScheduler)
    private readonly scheduler: WorkerRuntimeScheduler,
    @inject(AppContainerLifecycle)
    private readonly lifecycle: AppContainerLifecycle,
  ) {}

  async start(queues: ReadonlyArray<string>): Promise<WorkerRuntimeHandle> {
    if (this.appConfig.env.CODEMATION_SKIP_STARTUP_MIGRATIONS !== "true") {
      await this.databaseMigrations.migrate();
    }
    await this.runtimeWorkflowActivationPolicy.hydrateFromRepository(this.workflowActivationRepository);
    const workflows = [...this.workflowRepository.list()];
    await this.engine.start(workflows);
    await this.runEventBusTelemetryReporter.start();
    this.workflowRunRetentionPruneScheduler.start();
    const worker = this.scheduler.createWorker({
      queues,
      requestHandler: this.engine,
    });
    return {
      stop: async () => {
        await worker.stop();
        await this.scheduler.close();
        await this.lifecycle.stop({ stopWebsocketServer: false });
      },
    };
  }
}
