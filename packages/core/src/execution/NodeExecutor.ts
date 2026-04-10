import { z } from "zod";
import { isPortsEmission, isUnbrandedPortsEmissionShape } from "../contracts/emitPorts";

import type {
  Item,
  LineageCarryPolicy,
  MultiInputNode,
  NodeActivationRequest,
  NodeConfigBase,
  NodeExecutionContext,
  NodeOutputs,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  TriggerNode,
  WorkflowNodeInstanceFactory,
} from "../types";

import { FanInMergeByOriginMerger } from "./FanInMergeByOriginMerger";
import { ItemValueResolver } from "./ItemValueResolver";
import { InProcessRetryRunner } from "./InProcessRetryRunner";
import { NodeOutputNormalizer } from "./NodeOutputNormalizer";

export class NodeExecutor {
  private readonly fanInMerger = new FanInMergeByOriginMerger();
  private readonly outputNormalizer = new NodeOutputNormalizer();
  private readonly itemValueResolver: ItemValueResolver;

  constructor(
    private readonly nodeInstanceFactory: WorkflowNodeInstanceFactory,
    private readonly retryRunner: InProcessRetryRunner,
    itemValueResolver?: ItemValueResolver,
  ) {
    this.itemValueResolver = itemValueResolver ?? new ItemValueResolver();
  }

  async execute(request: NodeActivationRequest): Promise<NodeOutputs> {
    const policy = request.ctx.config.retryPolicy;
    return await this.retryRunner.run(policy, async () => {
      const nodeInstance = this.nodeInstanceFactory.createByType(request.ctx.config.type);
      if (request.kind === "multi") {
        return await this.executeMultiInputActivation(request, nodeInstance);
      }
      return await this.executeSingleInputNode(request, nodeInstance);
    });
  }

  private async executeMultiInputActivation(
    request: Extract<NodeActivationRequest, { kind: "multi" }>,
    node: unknown,
  ): Promise<NodeOutputs> {
    const multiInputNode = node as MultiInputNode;
    if (typeof (multiInputNode as { executeMulti?: unknown }).executeMulti === "function") {
      const raw = await multiInputNode.executeMulti(request.inputsByPort, request.ctx as never);
      this.assertNoPortEnvelopeBypass(request.nodeId, raw, "executeMulti()");
      return raw;
    }
    if (this.isRunnableNode(node)) {
      const merged = this.fanInMerger.merge(request.inputsByPort);
      const single: Extract<NodeActivationRequest, { kind: "single" }> = {
        ...request,
        kind: "single",
        input: merged,
      };
      return await this.executeRunnableActivation(single, node);
    }
    throw new Error(
      `Node ${request.nodeId} does not support executeMulti or RunnableNode.execute but received multi-input activation`,
    );
  }

  private async executeSingleInputNode(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
    node: unknown,
  ): Promise<NodeOutputs> {
    if (this.isTriggerNode(node)) {
      const raw = await (node as TriggerNode).execute(request.input, request.ctx as never);
      this.assertNoPortEnvelopeBypass(request.nodeId, raw, "trigger execute()");
      return raw;
    }
    if (this.isRunnableNode(node)) {
      return await this.executeRunnableActivation(request, node);
    }
    if (this.hasExecuteMulti(node)) {
      return await this.executeMultiInputActivation(this.asMultiFromSingleActivation(request), node);
    }
    throw new Error(`Node ${request.nodeId} does not support trigger or RunnableNode execution`);
  }

  private isTriggerNode(node: unknown): node is TriggerNode {
    return typeof node === "object" && node !== null && (node as { kind?: string }).kind === "trigger";
  }

  private isRunnableNode(node: unknown): node is RunnableNode {
    return (
      typeof node === "object" &&
      node !== null &&
      (node as { kind?: string }).kind === "node" &&
      typeof (node as { execute?: unknown }).execute === "function"
    );
  }

  private hasExecuteMulti(node: unknown): boolean {
    return typeof (node as { executeMulti?: unknown })?.executeMulti === "function";
  }

  private asMultiFromSingleActivation(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
  ): Extract<NodeActivationRequest, { kind: "multi" }> {
    return {
      kind: "multi",
      runId: request.runId,
      activationId: request.activationId,
      workflowId: request.workflowId,
      nodeId: request.nodeId,
      parent: request.parent,
      executionOptions: request.executionOptions,
      batchId: request.batchId,
      ctx: request.ctx,
      inputsByPort: { in: request.input ?? [] },
    };
  }

  private async executeRunnableActivation(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
    node: RunnableNode,
  ): Promise<NodeOutputs> {
    const runnableConfig = request.ctx.config as RunnableNodeConfig;
    const carry = this.resolveLineageCarry(node, runnableConfig);
    const inputSchema = this.resolveInputSchema(node, runnableConfig);
    const inputBatch = request.input ?? [];
    if (inputBatch.length === 0 && runnableConfig.emptyBatchExecution === "runOnce") {
      const syntheticItem: Item = { json: {} };
      const parsed = inputSchema.parse(syntheticItem.json);
      const runnableCtx = request.ctx as NodeExecutionContext<RunnableNodeConfig>;
      const resolvedCtx = await this.itemValueResolver.resolveConfigForItem(runnableCtx, syntheticItem, 0, inputBatch);
      const ctx = this.pickExecutionContext(runnableCtx, resolvedCtx);
      const args: RunnableNodeExecuteArgs = {
        input: parsed,
        item: syntheticItem,
        itemIndex: 0,
        items: inputBatch,
        ctx,
      };
      const raw = await Promise.resolve(node.execute(args));
      return this.outputNormalizer.normalizeExecuteResult({
        baseItem: syntheticItem,
        raw,
        carry,
      }) as NodeOutputs;
    }
    const byPort: Partial<Record<string, Item[]>> = {};
    for (let i = 0; i < inputBatch.length; i++) {
      const item = inputBatch[i] as Item;
      this.assertItemJsonNotTopLevelArray(request.nodeId, item);
      const parsed = inputSchema.parse(item.json);
      const runnableCtx = request.ctx as NodeExecutionContext<RunnableNodeConfig>;
      const resolvedCtx = await this.itemValueResolver.resolveConfigForItem(runnableCtx, item, i, inputBatch);
      const ctx = this.pickExecutionContext(runnableCtx, resolvedCtx);
      const args: RunnableNodeExecuteArgs = {
        input: parsed,
        item,
        itemIndex: i,
        items: inputBatch,
        ctx,
      };
      const raw = await Promise.resolve(node.execute(args));
      const normalized = this.outputNormalizer.normalizeExecuteResult({
        baseItem: item,
        raw,
        carry,
      });
      for (const [port, batch] of Object.entries(normalized)) {
        if (!batch || batch.length === 0) {
          continue;
        }
        const list = byPort[port] ?? [];
        list.push(...batch);
        byPort[port] = list;
      }
    }
    return byPort as NodeOutputs;
  }

  /** Use resolver ctx only when {@link NodeExecutionContext.config} is non-nullish. */
  private pickExecutionContext<TConfig extends RunnableNodeConfig<any, any>>(
    runnableCtx: NodeExecutionContext<TConfig>,
    resolvedCtx: NodeExecutionContext<TConfig> | null | undefined,
  ): NodeExecutionContext<TConfig> {
    if (resolvedCtx != null && resolvedCtx.config != null) {
      return resolvedCtx;
    }
    return runnableCtx;
  }

  private resolveInputSchema(
    nodeInstance: RunnableNode,
    config: RunnableNodeConfig,
  ): {
    parse: (data: unknown) => unknown;
  } {
    const fromInstance = nodeInstance.inputSchema;
    if (fromInstance && typeof fromInstance.parse === "function") {
      return fromInstance as { parse: (data: unknown) => unknown };
    }
    const fromConfig = config.inputSchema;
    if (fromConfig && typeof fromConfig.parse === "function") {
      return fromConfig as { parse: (data: unknown) => unknown };
    }
    return z.unknown();
  }

  private assertItemJsonNotTopLevelArray(nodeId: string, item: Item): void {
    if (Array.isArray(item.json)) {
      throw new Error(`Node ${nodeId}: item.json must not be a top-level JSON array`);
    }
  }

  private assertNoPortEnvelopeBypass(nodeId: string, value: unknown, methodName: string): void {
    if (isPortsEmission(value)) {
      throw new Error(`Node ${nodeId}: ${methodName} must return NodeOutputs, not emitPorts(...).`);
    }
    if (isUnbrandedPortsEmissionShape(value)) {
      throw new Error(
        `Node ${nodeId}: ${methodName} returned an unbranded \`{ ports: ... }\` object. Return NodeOutputs instead.`,
      );
    }
  }

  private resolveLineageCarry(node: unknown, config: RunnableNodeConfig): LineageCarryPolicy {
    if (config.lineageCarry) {
      return config.lineageCarry;
    }

    const base = config as NodeConfigBase;
    const declared = base.declaredOutputPorts;
    const ports =
      declared && declared.length > 0
        ? [...new Set([...(declared as readonly string[]), ...(base.nodeErrorHandler ? ["error"] : [])])]
        : base.nodeErrorHandler
          ? (["main", "error"] as const)
          : (["main"] as const);

    if (ports.length > 1) {
      return "carryThrough";
    }
    return "emitOnly";
  }
}
