import type { TypeToken } from "../../../di";
import type { NodeConfigBase, PersistedTokenId, WorkflowDefinition } from "../../../types";

export class PersistedWorkflowTokenRegistry {
  private readonly tokensById = new Map<PersistedTokenId, TypeToken<unknown>>();

  constructor(workflows: ReadonlyArray<WorkflowDefinition>) {
    for (const workflow of workflows) {
      this.registerWorkflow(workflow);
    }
  }

  resolve(tokenId: PersistedTokenId): TypeToken<unknown> | undefined {
    return this.tokensById.get(tokenId);
  }

  private registerWorkflow(workflow: WorkflowDefinition): void {
    for (const node of workflow.nodes) {
      this.registerToken(node.tokenId, node.token);
      this.registerConfig(node.config);
    }
  }

  private registerConfig(config: NodeConfigBase): void {
    this.registerToken(config.tokenId, config.token);
    this.registerNestedValue(config);
  }

  private registerNestedValue(value: unknown): void {
    if (Array.isArray(value)) {
      for (const entry of value) {
        this.registerNestedValue(entry);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    const tokenId = typeof record.tokenId === "string" ? record.tokenId : undefined;
    const token = this.asTypeToken(record.token);
    if (tokenId && token) {
      this.registerToken(tokenId, token);
    }
    for (const nestedValue of Object.values(record)) {
      this.registerNestedValue(nestedValue);
    }
  }

  private registerToken(tokenId: PersistedTokenId, token: TypeToken<unknown>): void {
    this.tokensById.set(tokenId, token);
  }

  private asTypeToken(value: unknown): TypeToken<unknown> | undefined {
    if (typeof value === "function" || typeof value === "string" || typeof value === "symbol") {
      return value as TypeToken<unknown>;
    }
    return undefined;
  }
}
