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
