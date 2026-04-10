import { z, ZodError } from "zod";

import type { Item, NodeActivationRequest, RunnableNodeConfig, WorkflowNodeInstanceFactory } from "../types";

import { FanInMergeByOriginMerger } from "./FanInMergeByOriginMerger";
import { NodeInputContractError } from "./NodeInputContractError";

/**
 * Validates per-item inputs for {@link RunnableNode} before enqueue persistence (Zod on `item.json`).
 * Does not rewrite `item.json` (wire stays as emitted upstream; engine passes parsed input via `execute` args).
 * Converts multi-input activations into a single-input batch when the node is per-item only (engine fan-in).
 */
export class NodeActivationRequestInputPreparer {
  private readonly fanInMerger = new FanInMergeByOriginMerger();

  constructor(private readonly workflowNodeInstanceFactory: WorkflowNodeInstanceFactory) {}

  async prepare(request: NodeActivationRequest): Promise<NodeActivationRequest> {
    if (request.kind === "multi") {
      return await this.prepareMulti(request);
    }
    return await this.prepareSingle(request);
  }

  private async prepareMulti(
    request: Extract<NodeActivationRequest, { kind: "multi" }>,
  ): Promise<NodeActivationRequest> {
    const nodeInstance: unknown = this.workflowNodeInstanceFactory.createByType(request.ctx.config.type);
    if (
      !this.hasRunnableExecute(nodeInstance) ||
      this.hasExecuteMulti(nodeInstance) ||
      this.isTriggerNode(nodeInstance)
    ) {
      return request;
    }
    const merged = this.fanInMerger.merge(request.inputsByPort);
    const single: Extract<NodeActivationRequest, { kind: "single" }> = {
      ...request,
      kind: "single",
      input: merged,
    };
    return await this.prepareSingle(single);
  }

  private async prepareSingle(
    request: Extract<NodeActivationRequest, { kind: "single" }>,
  ): Promise<NodeActivationRequest> {
    const nodeInstance: unknown = this.workflowNodeInstanceFactory.createByType(request.ctx.config.type);
    if (!this.hasRunnableExecute(nodeInstance) || this.isTriggerNode(nodeInstance)) {
      return request;
    }
    const inputSchema = this.resolveInputSchema(nodeInstance, request.ctx.config as RunnableNodeConfig);
    const inputBatch = request.input ?? [];
    for (let i = 0; i < inputBatch.length; i++) {
      const item = inputBatch[i] as Item;
      try {
        if (Array.isArray(item.json)) {
          throw new Error("Item JSON must not be a top-level array");
        }
        inputSchema.parse(item.json);
      } catch (cause) {
        const message = this.formatContractFailure(cause);
        throw new NodeInputContractError(
          `Node ${request.nodeId} activation ${request.activationId}: input contract failed: ${message}`,
          request.nodeId,
          request.activationId,
          cause,
        );
      }
    }
    return request.input === undefined ? { ...request, input: inputBatch } : request;
  }

  private isTriggerNode(nodeInstance: unknown): boolean {
    return (
      typeof nodeInstance === "object" &&
      nodeInstance !== null &&
      (nodeInstance as { kind?: string }).kind === "trigger"
    );
  }

  private hasRunnableExecute(nodeInstance: unknown): boolean {
    return (
      typeof nodeInstance === "object" &&
      nodeInstance !== null &&
      (nodeInstance as { kind?: string }).kind === "node" &&
      typeof (nodeInstance as { execute?: unknown }).execute === "function"
    );
  }

  private hasExecuteMulti(nodeInstance: unknown): boolean {
    return typeof (nodeInstance as { executeMulti?: unknown }).executeMulti === "function";
  }

  private resolveInputSchema(
    nodeInstance: unknown,
    config: RunnableNodeConfig,
  ): {
    parse: (data: unknown) => unknown;
  } {
    const fromInstance = (nodeInstance as { inputSchema?: unknown }).inputSchema;
    if (fromInstance && typeof (fromInstance as { parse?: unknown }).parse === "function") {
      return fromInstance as { parse: (data: unknown) => unknown };
    }
    const fromConfig = config.inputSchema;
    if (fromConfig && typeof fromConfig.parse === "function") {
      return fromConfig as { parse: (data: unknown) => unknown };
    }
    return z.unknown();
  }

  private formatContractFailure(cause: unknown): string {
    if (cause instanceof ZodError) {
      return cause.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    }
    if (cause instanceof Error) {
      return cause.message;
    }
    return String(cause);
  }
}
