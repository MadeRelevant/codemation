import { CoreTokens, inject, injectable, type WorkflowRepository } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { WorkflowRunEventWebsocketRelay } from "../../application/websocket/WorkflowRunEventWebsocketRelay";
import { WorkflowWebsocketServer } from "../../presentation/websocket/WorkflowWebsocketServer";
import { DatabaseMigrations } from "./DatabaseMigrations";
import type { WorkflowActivationRepository } from "../../domain/workflows/WorkflowActivationRepository";

@injectable()
export class FrontendRuntime {
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
    @inject(WorkflowWebsocketServer)
    private readonly workflowWebsocketServer: WorkflowWebsocketServer,
    @inject(WorkflowRunEventWebsocketRelay)
    private readonly workflowRunEventWebsocketRelay: WorkflowRunEventWebsocketRelay,
    @inject(Engine)
    private readonly engine: Engine,
  ) {}

  async start(args?: Readonly<{ skipPresentationServers?: boolean }>): Promise<void> {
    if (this.appConfig.env.CODEMATION_SKIP_STARTUP_MIGRATIONS !== "true") {
      await this.databaseMigrations.migrate();
    }
    await this.runtimeWorkflowActivationPolicy.hydrateFromRepository(this.workflowActivationRepository);
    if (args?.skipPresentationServers === true) {
      return;
    }
    await this.engine.start([...this.workflowRepository.list()]);
    await this.workflowWebsocketServer.start();
    await this.workflowRunEventWebsocketRelay.start();
  }
}
