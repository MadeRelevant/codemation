import type {
  BinaryStorage,
  CredentialSessionService,
  EngineExecutionLimitsPolicy,
  NodeActivationContinuation,
  NodeExecutionRequest,
  NodeResolver,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowId,
} from "@codemation/core";
import { BullmqNodeExecutionScheduler } from "./BullmqNodeExecutionScheduler";
import { BullmqWorker } from "./BullmqWorker";
import type { RedisConnectionConfig } from "./RedisConnectionOptionsFactory";
import type { WorkerRuntimeScheduler } from "./WorkerRuntimeScheduler";

export class BullmqScheduler implements WorkerRuntimeScheduler {
  private readonly scheduler: BullmqNodeExecutionScheduler;

  constructor(
    private readonly connection: RedisConnectionConfig,
    private readonly queuePrefix: string = "codemation",
  ) {
    this.scheduler = new BullmqNodeExecutionScheduler(connection, queuePrefix);
  }

  async enqueue(request: NodeExecutionRequest): Promise<{ receiptId: string }> {
    return await this.scheduler.enqueue(request);
  }

  async close(): Promise<void> {
    await this.scheduler.close();
  }

  createWorker(
    args: Readonly<{
      queues: ReadonlyArray<string>;
      workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>;
      nodeResolver: NodeResolver;
      credentialSessions: CredentialSessionService;
      workflowExecutionRepository: WorkflowExecutionRepository;
      continuation: NodeActivationContinuation;
      binaryStorage?: BinaryStorage;
      workflows?: unknown;
      now?: () => Date;
      executionLimitsPolicy?: EngineExecutionLimitsPolicy;
    }>,
  ): BullmqWorker {
    return new BullmqWorker(
      this.connection,
      args.queues,
      args.workflowsById,
      args.nodeResolver,
      args.credentialSessions,
      args.workflowExecutionRepository,
      args.continuation,
      this.queuePrefix,
      args.workflows,
      args.now ?? (() => new Date()),
      args.binaryStorage,
      undefined,
      args.executionLimitsPolicy,
    );
  }
}
