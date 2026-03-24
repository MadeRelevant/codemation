import type {
BinaryStorage,
CredentialSessionService,
NodeActivationContinuation,
NodeExecutionRequest,
NodeExecutionScheduler,
NodeResolver,
RootExecutionOptionsFactory,
RunStateStore,
WorkflowDefinition,
WorkflowId,
} from "@codemation/core";

import { BullmqNodeExecutionScheduler } from "./bullmqNodeExecutionScheduler";
import { BullmqWorker } from "./bullmqWorker";
import type { RedisConnectionConfig } from "./redisConnection";

export class BullmqScheduler implements NodeExecutionScheduler {
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

  createWorker(args: Readonly<{
    queues: ReadonlyArray<string>;
    workflowsById: ReadonlyMap<WorkflowId, WorkflowDefinition>;
    nodeResolver: NodeResolver;
    credentialSessions: CredentialSessionService;
    runStore: RunStateStore;
    continuation: NodeActivationContinuation;
    binaryStorage?: BinaryStorage;
    workflows?: unknown;
    now?: () => Date;
    /** When set, must match the host engine policy so worker execution contexts use the same limits as `runtime.engineExecutionLimits`. */
    rootExecutionOptionsFactory?: RootExecutionOptionsFactory;
  }>): BullmqWorker {
    if (args.workflows !== undefined || args.now !== undefined) {
      return new BullmqWorker(
        this.connection,
        args.queues,
        args.workflowsById,
        args.nodeResolver,
        args.credentialSessions,
        args.runStore,
        args.continuation,
        this.queuePrefix,
        args.workflows,
        args.now ?? (() => new Date()),
        args.binaryStorage,
        undefined,
        args.rootExecutionOptionsFactory,
      );
    }

    return new BullmqWorker(
      this.connection,
      args.queues,
      args.workflowsById,
      args.nodeResolver,
      args.credentialSessions,
      args.runStore,
      args.continuation,
      this.queuePrefix,
      undefined,
      () => new Date(),
      args.binaryStorage,
      undefined,
      args.rootExecutionOptionsFactory,
    );
  }
}

