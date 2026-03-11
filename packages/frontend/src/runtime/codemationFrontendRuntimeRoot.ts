import type { RunEventBus, RunStateStore, WorkflowDefinition, WorkflowId, WorkflowRegistry, WorkflowRunnerService } from "@codemation/core";
import { Engine, injectable } from "@codemation/core";
import type { RealtimeRuntimeDiagnostics } from "../realtimeRuntimeFactory";
import { CodemationWebhookRegistry } from "../host/codemationWebhookRegistry";
import { CodemationWorkflowDtoMapper } from "../host/codemationWorkflowDtoMapper";
import { CodemationRealtimeSocketServer } from "./codemationRealtimeSocketServer";

@injectable()
export class CodemationFrontendRuntimeRoot {
  private started = false;

  constructor(
    private readonly engine: Engine,
    private readonly workflowRegistry: WorkflowRegistry,
    private readonly workflowRunner: WorkflowRunnerService,
    private readonly runStore: RunStateStore,
    private readonly eventBus: RunEventBus,
    private readonly websocketServer: CodemationRealtimeSocketServer,
    private readonly webhookRegistry: CodemationWebhookRegistry,
    private readonly workflowDtoMapper: CodemationWorkflowDtoMapper,
    private readonly runtimeDiagnostics: RealtimeRuntimeDiagnostics,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    await this.engine.start([...this.workflowRegistry.list()]);
    await this.websocketServer.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.websocketServer.stop();
    this.started = false;
  }

  listWorkflows(): ReadonlyArray<WorkflowDefinition> {
    return this.workflowRegistry.list();
  }

  getWorkflow(workflowId: WorkflowId): WorkflowDefinition | undefined {
    return this.workflowRegistry.get(workflowId);
  }

  getWorkflowRegistry(): WorkflowRegistry {
    return this.workflowRegistry;
  }

  getEngine(): Engine {
    return this.engine;
  }

  getWorkflowRunner(): WorkflowRunnerService {
    return this.workflowRunner;
  }

  getRunStore(): RunStateStore {
    return this.runStore;
  }

  getEventBus(): RunEventBus {
    return this.eventBus;
  }

  getWebhookRegistry(): CodemationWebhookRegistry {
    return this.webhookRegistry;
  }

  getWorkflowDtoMapper(): CodemationWorkflowDtoMapper {
    return this.workflowDtoMapper;
  }

  getRuntimeDiagnostics(): RealtimeRuntimeDiagnostics {
    return this.runtimeDiagnostics;
  }

  getWebsocketPort(): number {
    return this.websocketServer.getPort();
  }
}
