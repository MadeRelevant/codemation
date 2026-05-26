import { z } from "zod";
import { isPortsEmission, isUnbrandedPortsEmissionShape } from "../contracts/emitPorts";
import { CredentialUnboundError } from "../contracts/credentialTypes";
import { SuspensionRequest } from "../contracts/runtimeTypes";

import type {
  Item,
  MultiInputNode,
  NodeActivationRequest,
  NodeExecutionContext,
  NodeOutputs,
  PersistedRunState,
  RunnableNode,
  RunnableNodeConfig,
  RunnableNodeExecuteArgs,
  RunId,
  TriggerNode,
  WorkflowNodeInstanceFactory,
} from "../types";
import { NodeIterationIdFactory } from "../workflow/definition/NodeIterationIdFactory";

import { FanInMergeByOriginMerger } from "./FanInMergeByOriginMerger";
import { ItemExprResolver } from "./ItemExprResolver";
import { InProcessRetryRunner } from "./InProcessRetryRunner";
import { NodeOutputNormalizer } from "./NodeOutputNormalizer";
import { NodeSuspensionHandler } from "./NodeSuspensionHandler";
import { RunSuspendedError } from "./RunSuspendedError";
import { RunnableOutputBehaviorResolver } from "./RunnableOutputBehaviorResolver";

export class NodeExecutor {
  private readonly fanInMerger = new FanInMergeByOriginMerger();
  private readonly outputNormalizer = new NodeOutputNormalizer();
  private readonly itemExprResolver: ItemExprResolver;
  private readonly outputBehaviorResolver: RunnableOutputBehaviorResolver;

  constructor(
    private readonly nodeInstanceFactory: WorkflowNodeInstanceFactory,
    private readonly retryRunner: InProcessRetryRunner,
    itemExprResolver?: ItemExprResolver,
    outputBehaviorResolver?: RunnableOutputBehaviorResolver,
    /** Required for HITL suspension support. When omitted, `SuspensionRequest` throws upward. */
    private readonly suspensionHandler?: NodeSuspensionHandler,
    /** Required alongside `suspensionHandler`. */
    private readonly loadRunState?: (runId: RunId) => Promise<PersistedRunState | undefined>,
  ) {
    this.itemExprResolver = itemExprResolver ?? new ItemExprResolver();
    this.outputBehaviorResolver = outputBehaviorResolver ?? new RunnableOutputBehaviorResolver();
  }

  async execute(request: NodeActivationRequest): Promise<NodeOutputs> {
    await this.assertRequiredCredentialsBound(request);
    const policy = request.ctx.config.retryPolicy;
    return await this.retryRunner.run(
      policy,
      async () => {
        const nodeInstance = this.nodeInstanceFactory.createByType(request.ctx.config.type);
        if (request.kind === "multi") {
          return await this.executeMultiInputActivation(request, nodeInstance);
        }
        return await this.executeSingleInputNode(request, nodeInstance);
      },
      (error) => !this.isCredentialError(error),
    );
  }

  private async assertRequiredCredentialsBound(request: NodeActivationRequest): Promise<void> {
    if (!request.ctx.getCredential) return;
    for (const req of request.ctx.config.getCredentialRequirements?.() ?? []) {
      if (req.optional) continue;
      await request.ctx.getCredential(req.slotKey);
    }
  }

  private isCredentialError(e: unknown): boolean {
    if (e instanceof CredentialUnboundError) return true;
    const cause = e instanceof Error ? (e as { cause?: unknown }).cause : undefined;
    return cause instanceof CredentialUnboundError;
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
    const behavior = this.outputBehaviorResolver.resolve(runnableConfig);
    const inputSchema = this.resolveInputSchema(node, runnableConfig);
    const inputBatch = request.input ?? [];
    if (inputBatch.length === 0 && runnableConfig.emptyBatchExecution === "runOnce") {
      const syntheticItem: Item = { json: {} };
      const parsed = inputSchema.parse(syntheticItem.json);
      const runnableCtx = request.ctx as NodeExecutionContext<RunnableNodeConfig>;
      const resolvedCtx = await this.itemExprResolver.resolveConfigForItem(runnableCtx, syntheticItem, 0, inputBatch);
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
        behavior,
      }) as NodeOutputs;
    }
    const byPort: Partial<Record<string, Item[]>> = {};
    let hasSuspension = false;
    for (let i = 0; i < inputBatch.length; i++) {
      const item = inputBatch[i] as Item;
      this.assertItemJsonNotTopLevelArray(request.nodeId, item);
      const parsed = inputSchema.parse(item.json);
      const runnableCtx = request.ctx as NodeExecutionContext<RunnableNodeConfig>;
      const resolvedCtx = await this.itemExprResolver.resolveConfigForItem(runnableCtx, item, i, inputBatch);
      const baseCtx = this.pickExecutionContext(runnableCtx, resolvedCtx);
      // Mint a per-item iteration id and stamp it (with the item index) onto the ctx so connection
      // invocations and telemetry written from inside `node.execute` carry the per-item identity.
      const iterationCtx = {
        ...baseCtx,
        iterationId: NodeIterationIdFactory.create(),
        itemIndex: i,
      } as NodeExecutionContext<RunnableNodeConfig>;
      const args: RunnableNodeExecuteArgs = {
        input: parsed,
        item,
        itemIndex: i,
        items: inputBatch,
        ctx: iterationCtx,
      };
      let raw: unknown;
      try {
        raw = await Promise.resolve(node.execute(args));
      } catch (e) {
        if (e instanceof SuspensionRequest) {
          if (!this.suspensionHandler || !this.loadRunState) {
            // Suspension not supported in this executor configuration — propagate as a regular error.
            throw new Error(
              `Node ${request.nodeId} threw SuspensionRequest but this NodeExecutor has no suspensionHandler configured.`,
              { cause: e },
            );
          }
          // Per-item suspension (D2): load current state, persist the suspension entry, and
          // continue processing remaining items. If deliver throws it propagates upward.
          const state = await this.loadRunState(request.runId);
          if (!state) {
            throw new Error(`NodeExecutor: run state not found for runId ${request.runId} during suspension`, {
              cause: e,
            });
          }
          // handleSuspension throws RunSuspendedError after persisting — we re-throw it
          // to exit the loop immediately. Partial byPort outputs are intentionally dropped
          // (TODO(story-04): consider stashing outputs of non-suspended items alongside the suspension).
          await this.suspensionHandler.handle({
            runId: request.runId,
            nodeId: request.nodeId,
            activationId: request.activationId,
            itemIndex: i,
            suspensionRequest: e,
            state,
          });
          hasSuspension = true; // unreachable — handler always throws, but satisfies TS control-flow
          continue;
        }
        throw e;
      }
      const normalized = this.outputNormalizer.normalizeExecuteResult({
        baseItem: item,
        raw,
        behavior,
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
    if (hasSuspension) {
      // Unreachable in practice (suspensionHandler always throws RunSuspendedError) but
      // guards against future refactors that might change handler behaviour.
      throw new RunSuspendedError(request.runId, "unknown");
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
}
