import { z, ZodError } from "zod";

import type { Item, NodeActivationRequest, RunnableNodeConfig, WorkflowNodeInstanceFactory } from "../types";

import { NodeInputContractError } from "./NodeInputContractError";

/**
 * Maps and validates per-item inputs for {@link ItemNode} before enqueue persistence.
 */
export class NodeActivationRequestInputPreparer {
  constructor(private readonly workflowNodeInstanceFactory: WorkflowNodeInstanceFactory) {}

  async prepare(request: NodeActivationRequest): Promise<NodeActivationRequest> {
    if (request.kind !== "single") {
      return request;
    }
    const nodeInstance: unknown = this.workflowNodeInstanceFactory.createByType(request.ctx.config.type);
    if (!this.hasExecuteOne(nodeInstance)) {
      return request;
    }
    const inputSchema = this.resolveInputSchema(nodeInstance, request.ctx.config as RunnableNodeConfig);
    const config = request.ctx.config as RunnableNodeConfig;
    const mappedItems: Item[] = [];
    for (let i = 0; i < request.input.length; i++) {
      const item = request.input[i] as Item;
      try {
        const mappedRaw = config.mapInput
          ? await Promise.resolve(
              config.mapInput({
                item,
                itemIndex: i,
                items: request.input,
                ctx: request.ctx,
              }),
            )
          : item.json;
        const parsed = inputSchema.parse(mappedRaw);
        mappedItems.push({ ...item, json: parsed });
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
    return {
      ...request,
      input: mappedItems,
    };
  }

  private hasExecuteOne(nodeInstance: unknown): boolean {
    return (
      typeof nodeInstance === "object" &&
      nodeInstance !== null &&
      typeof (nodeInstance as { executeOne?: unknown }).executeOne === "function"
    );
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
