import type {
  ExecutionContextFactory,
  Items,
  JsonValue,
  NodeId,
  NodeResolver,
  RunDataFactory,
  RunIdFactory,
  TestableTriggerNode,
  TriggerCleanupHandle,
  TriggerInstanceId,
  TriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
  TriggerSetupStateStore,
  WebhookRegistrar,
  WebhookTriggerMatcher,
  WorkflowDefinition,
  WorkflowRepository,
} from "../../../types";

import type { NodeExecutionStatePublisherFactory } from "../state/NodeExecutionStatePublisherFactory";

import { CredentialResolverFactory } from "../credentials/CredentialResolverFactory";
import type { RootExecutionOptionsFactory } from "../policies/RootExecutionOptionsFactory";

export interface TriggerEmitHandler {
  emit(workflow: WorkflowDefinition, triggerNodeId: NodeId, items: Items): Promise<void>;
}

export class TriggerRuntimeService {
  private readonly credentialResolverFactory: CredentialResolverFactory;
  private readonly triggerCleanupHandlesByKey = new Map<string, TriggerCleanupHandle[]>();

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly runIdFactory: RunIdFactory,
    private readonly runDataFactory: RunDataFactory,
    private readonly executionContextFactory: ExecutionContextFactory,
    credentialResolverFactory: CredentialResolverFactory,
    private readonly nodeExecutionStatePublisherFactory: NodeExecutionStatePublisherFactory,
    private readonly nodeResolver: NodeResolver,
    private readonly triggerSetupStateStore: TriggerSetupStateStore,
    private readonly webhookRegistrar: WebhookRegistrar,
    private readonly webhookTriggerMatcher: WebhookTriggerMatcher,
    private readonly webhookBasePath: string,
    private readonly emitHandler: TriggerEmitHandler,
    private readonly rootExecutionOptionsFactory: RootExecutionOptionsFactory,
  ) {
    this.credentialResolverFactory = credentialResolverFactory;
  }

  async startTriggers(): Promise<void> {
    for (const wf of this.workflowRepository.list()) {
      for (const def of wf.nodes) {
        if (def.kind !== "trigger") continue;
        const node = this.nodeResolver.resolve(def.type) as TriggerNode;
        const data = this.runDataFactory.create();
        const triggerRunId = this.runIdFactory.makeRunId();
        const trigger = { workflowId: wf.id, nodeId: def.id } as const;
        await this.stopTrigger(trigger);
        const previousState = await this.triggerSetupStateStore.load(trigger);
        let nextState: unknown;
        try {
          nextState = await node.setup({
            ...this.createExecutionContext({
              runId: triggerRunId,
              workflowId: wf.id,
              nodeId: def.id,
              data,
            }),
            trigger,
            config: def.config as TriggerNodeConfig,
            previousState: previousState?.state as never,
            registerCleanup: (cleanup) => {
              this.registerTriggerCleanupHandle(trigger, cleanup);
            },
            registerWebhook: (spec) => {
              const registration = this.webhookRegistrar.registerWebhook({
                workflowId: wf.id,
                nodeId: def.id,
                endpointKey: spec.endpointKey,
                methods: spec.methods,
                parseJsonBody: spec.parseJsonBody,
                basePath: this.webhookBasePath,
              });
              this.webhookTriggerMatcher.register({
                workflowId: wf.id,
                nodeId: def.id,
                endpointId: registration.endpointId,
                methods: registration.methods,
                parseJsonBody: spec.parseJsonBody,
              });
              return registration;
            },
            emit: async (items) => {
              await this.emitHandler.emit(wf, def.id, items);
            },
          } satisfies TriggerSetupContext<TriggerNodeConfig>);
        } catch (triggerError: unknown) {
          await this.stopTrigger(trigger);
          const message = triggerError instanceof Error ? triggerError.message : String(triggerError);
          console.warn(`[engine] Skipping trigger setup for workflow ${wf.id} node ${def.id}: ${message}`);
          continue;
        }
        if (nextState === undefined) {
          await this.triggerSetupStateStore.delete(trigger);
        } else {
          await this.triggerSetupStateStore.save({
            trigger,
            updatedAt: new Date().toISOString(),
            state: nextState as JsonValue | undefined,
          });
        }
      }
    }
  }

  async stop(): Promise<void> {
    for (const workflow of this.workflowRepository.list()) {
      for (const node of workflow.nodes) {
        if (node.kind !== "trigger") {
          continue;
        }
        await this.stopTrigger({
          workflowId: workflow.id,
          nodeId: node.id,
        });
      }
    }
    await this.webhookRegistrar.clear?.();
    this.webhookTriggerMatcher.clear?.();
  }

  async createTriggerTestItems(args: { workflow: WorkflowDefinition; nodeId: NodeId }): Promise<Items | undefined> {
    const definition = args.workflow.nodes.find((node) => node.id === args.nodeId);
    if (!definition) {
      throw new Error(`Unknown trigger nodeId: ${args.nodeId}`);
    }
    if (definition.kind !== "trigger") {
      throw new Error(`Node ${args.nodeId} is not a trigger`);
    }
    const node = this.nodeResolver.resolve(definition.type) as TriggerNode;
    if (!this.isTestableTriggerNode(node)) {
      return undefined;
    }
    const data = this.runDataFactory.create();
    const runId = this.runIdFactory.makeRunId();
    const trigger = { workflowId: args.workflow.id, nodeId: definition.id } as const;
    const previousState = await this.triggerSetupStateStore.load(trigger);
    return await node.getTestItems({
      ...this.createExecutionContext({
        runId,
        workflowId: args.workflow.id,
        nodeId: definition.id,
        data,
      }),
      trigger,
      nodeId: definition.id,
      config: definition.config as TriggerNodeConfig,
      previousState: previousState?.state as never,
    });
  }

  private createExecutionContext(args: {
    runId: ReturnType<RunIdFactory["makeRunId"]>;
    workflowId: string;
    nodeId: NodeId;
    data: ReturnType<RunDataFactory["create"]>;
  }) {
    const nodeState = this.nodeExecutionStatePublisherFactory.create(args.runId, args.workflowId, undefined);
    const rootLimits = this.rootExecutionOptionsFactory.create();
    return this.executionContextFactory.create({
      runId: args.runId,
      workflowId: args.workflowId,
      parent: undefined,
      subworkflowDepth: rootLimits.subworkflowDepth ?? 0,
      engineMaxNodeActivations: rootLimits.maxNodeActivations!,
      engineMaxSubworkflowDepth: rootLimits.maxSubworkflowDepth!,
      data: args.data,
      nodeState,
      getCredential: this.credentialResolverFactory.create(args.workflowId, args.nodeId),
    });
  }

  private registerTriggerCleanupHandle(trigger: TriggerInstanceId, cleanup: TriggerCleanupHandle): void {
    const key = this.toTriggerKey(trigger);
    const cleanups = this.triggerCleanupHandlesByKey.get(key) ?? [];
    cleanups.push(cleanup);
    this.triggerCleanupHandlesByKey.set(key, cleanups);
  }

  private async stopTrigger(trigger: TriggerInstanceId): Promise<void> {
    const key = this.toTriggerKey(trigger);
    const cleanups = this.triggerCleanupHandlesByKey.get(key) ?? [];
    this.triggerCleanupHandlesByKey.delete(key);
    for (const cleanup of [...cleanups].reverse()) {
      await cleanup.stop();
    }
  }

  private toTriggerKey(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }

  private isTestableTriggerNode(node: TriggerNode): node is TestableTriggerNode<TriggerNodeConfig> {
    return typeof (node as Partial<TestableTriggerNode<TriggerNodeConfig>>).getTestItems === "function";
  }
}

