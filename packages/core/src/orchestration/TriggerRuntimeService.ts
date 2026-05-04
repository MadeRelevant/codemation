import type {
  ExecutionContextFactory,
  Items,
  JsonValue,
  NodeDefinition,
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
  TriggerSetupStateRepository,
  TriggerRuntimeDiagnostics,
  WorkflowActivationPolicy,
  WorkflowDefinition,
  WorkflowId,
  WorkflowRepository,
} from "../types";

import { CredentialResolverFactory } from "../execution/CredentialResolverFactory";
import type { NodeRunStateWriterFactory } from "../execution/NodeRunStateWriterFactory";
import type { EngineExecutionLimitsPolicy } from "../policies/executionLimits/EngineExecutionLimitsPolicy";
import type { PollingTriggerRuntime } from "../triggers/polling/PollingTriggerRuntime";
import type { PollingTriggerDedupWindow } from "../triggers/polling/PollingTriggerDedupWindow";
import type { PollingTriggerHandle } from "../contracts/runtimeTypes";

export interface TriggerEmitHandler {
  emit(workflow: WorkflowDefinition, triggerNodeId: NodeId, items: Items): Promise<void>;
}

export class TriggerRuntimeService {
  private readonly credentialResolverFactory: CredentialResolverFactory;
  private readonly triggerCleanupHandlesByKey = new Map<string, TriggerCleanupHandle[]>();

  constructor(
    private readonly workflowRepository: WorkflowRepository,
    private readonly workflowActivationPolicy: WorkflowActivationPolicy,
    private readonly runIdFactory: RunIdFactory,
    private readonly runDataFactory: RunDataFactory,
    private readonly executionContextFactory: ExecutionContextFactory,
    credentialResolverFactory: CredentialResolverFactory,
    private readonly nodeExecutionStatePublisherFactory: NodeRunStateWriterFactory,
    private readonly nodeResolver: NodeResolver,
    private readonly triggerSetupStateRepository: TriggerSetupStateRepository,
    private readonly emitHandler: TriggerEmitHandler,
    private readonly executionLimitsPolicy: EngineExecutionLimitsPolicy,
    private readonly diagnostics?: TriggerRuntimeDiagnostics,
    private readonly pollingTriggerRuntime?: PollingTriggerRuntime,
    private readonly pollingTriggerDedupWindow?: PollingTriggerDedupWindow,
  ) {
    this.credentialResolverFactory = credentialResolverFactory;
  }

  async startTriggers(): Promise<void> {
    for (const wf of this.workflowRepository.list()) {
      if (!this.workflowActivationPolicy.isActive(wf.id)) {
        const summaries = this.formatTriggerSummaries(wf);
        if (summaries.length > 0) {
          this.logInfo(
            `Workflow "${wf.name}" (${wf.id}) is inactive; skipping trigger setup — ${summaries.join("; ")}.`,
          );
        }
        continue;
      }
      await this.startTriggersForWorkflow(wf);
    }
  }

  async syncWorkflowTriggersForActivation(workflowId: WorkflowId): Promise<void> {
    const wf = this.workflowRepository.get(workflowId);
    if (!wf) {
      return;
    }
    const summaries = this.formatTriggerSummaries(wf);
    if (summaries.length > 0) {
      this.logInfo(`Workflow "${wf.name}" (${wf.id}): stopping triggers — ${summaries.join("; ")}.`);
    }
    await this.stopTriggersForWorkflow(wf);
    if (this.workflowActivationPolicy.isActive(workflowId)) {
      if (summaries.length > 0) {
        this.logInfo(`Workflow "${wf.name}" (${wf.id}): activation on; starting triggers — ${summaries.join("; ")}.`);
      }
      await this.startTriggersForWorkflow(wf);
    } else {
      this.logInfo(`Workflow "${wf.name}" (${wf.id}): activation off; triggers not started.`);
    }
  }

  async stop(): Promise<void> {
    for (const workflow of this.workflowRepository.list()) {
      await this.stopTriggersForWorkflow(workflow);
    }
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
    const previousState = await this.triggerSetupStateRepository.load(trigger);
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

  private async startTriggersForWorkflow(wf: WorkflowDefinition): Promise<void> {
    for (const def of wf.nodes) {
      if (def.kind !== "trigger") continue;
      if ((def.config as TriggerNodeConfig).triggerKind === "test") continue;
      const node = this.nodeResolver.resolve(def.type) as TriggerNode;
      const data = this.runDataFactory.create();
      const triggerRunId = this.runIdFactory.makeRunId();
      const trigger = { workflowId: wf.id, nodeId: def.id } as const;
      await this.stopTrigger(trigger);
      const previousState = await this.triggerSetupStateRepository.load(trigger);
      const emit = async (items: Items): Promise<void> => {
        await this.emitHandler.emit(wf, def.id, items);
      };
      const registerCleanup = (cleanup: TriggerCleanupHandle): void => {
        this.registerTriggerCleanupHandle(trigger, cleanup);
      };
      const polling = this.buildPollingHandle(trigger, emit, registerCleanup);
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
          registerCleanup,
          emit,
          polling,
        } satisfies TriggerSetupContext<TriggerNodeConfig>);
      } catch (triggerError: unknown) {
        await this.stopTrigger(trigger);
        const message = triggerError instanceof Error ? triggerError.message : String(triggerError);
        this.logWarn(`Skipping trigger setup for workflow ${wf.id} node ${def.id}: ${message}`);
        continue;
      }
      if (nextState === undefined) {
        await this.triggerSetupStateRepository.delete(trigger);
      } else {
        await this.triggerSetupStateRepository.save({
          trigger,
          updatedAt: new Date().toISOString(),
          state: nextState as JsonValue | undefined,
        });
      }
    }
  }

  private async stopTriggersForWorkflow(workflow: WorkflowDefinition): Promise<void> {
    for (const node of workflow.nodes) {
      if (node.kind !== "trigger") {
        continue;
      }
      if ((node.config as TriggerNodeConfig).triggerKind === "test") {
        continue;
      }
      await this.stopTrigger({
        workflowId: workflow.id,
        nodeId: node.id,
      });
    }
  }

  private createExecutionContext(args: {
    runId: ReturnType<RunIdFactory["makeRunId"]>;
    workflowId: string;
    nodeId: NodeId;
    data: ReturnType<RunDataFactory["create"]>;
  }) {
    const nodeState = this.nodeExecutionStatePublisherFactory.create(args.runId, args.workflowId, undefined);
    const rootLimits = this.executionLimitsPolicy.createRootExecutionOptions();
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

  private formatTriggerSummaries(wf: WorkflowDefinition): string[] {
    const out: string[] = [];
    for (const def of wf.nodes) {
      if (def.kind !== "trigger") {
        continue;
      }
      if ((def.config as TriggerNodeConfig).triggerKind === "test") {
        continue;
      }
      out.push(this.describeTriggerNode(def));
    }
    return out;
  }

  private describeTriggerNode(def: NodeDefinition): string {
    const label = def.name !== undefined && def.name.trim().length > 0 ? def.name.trim() : String(def.id);
    const cfg = def.config as { endpointKey?: unknown };
    if (typeof cfg.endpointKey === "string" && cfg.endpointKey.trim().length > 0) {
      return `${label} (webhook "${cfg.endpointKey.trim()}")`;
    }
    return label;
  }

  private logInfo(message: string): void {
    if (this.diagnostics) {
      this.diagnostics.info(message);
    }
  }

  private logWarn(message: string): void {
    if (this.diagnostics) {
      this.diagnostics.warn(message);
    } else {
      console.warn(`[engine] ${message}`);
    }
  }

  private buildPollingHandle(
    trigger: TriggerInstanceId,
    emit: (items: Items) => Promise<void>,
    registerCleanup: (cleanup: TriggerCleanupHandle) => void,
  ): PollingTriggerHandle {
    const runtime = this.pollingTriggerRuntime;
    // pollingTriggerDedupWindow is always provided by EngineFactory when pollingTriggerRuntime is present.
    const dedup = this.pollingTriggerDedupWindow;
    return {
      dedup: dedup as PollingTriggerDedupWindow,
      start: async (args) => {
        if (!runtime) {
          throw new Error("PollingTriggerRuntime is not available in this engine configuration.");
        }
        registerCleanup({
          stop: async () => {
            await runtime.stop(trigger);
          },
        });
        return runtime.start({ trigger, emit, ...args });
      },
    };
  }

  private isTestableTriggerNode(node: TriggerNode): node is TestableTriggerNode<TriggerNodeConfig> {
    return typeof (node as Partial<TestableTriggerNode<TriggerNodeConfig>>).getTestItems === "function";
  }
}
