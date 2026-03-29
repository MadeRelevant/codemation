import type { TypeToken } from "../di";

import type { PersistedTokenId, WorkflowDefinition } from "../types";

import { PersistedRuntimeTypeIdFactory } from "./PersistedRuntimeTypeIdFactory";

export class PersistedWorkflowTokenRegistry {
  private readonly tokensById = new Map<PersistedTokenId, TypeToken<unknown>>();
  private readonly tokenIdsByToken = new Map<TypeToken<unknown>, PersistedTokenId>();

  /**
   * Register a token with its package ID. Token ID is inferred as `packageId::tokenName`.
   */
  register(type: TypeToken<unknown>, packageId: string, persistedNameOverride?: string): PersistedTokenId {
    const tokenName = persistedNameOverride ?? this.displayNameForTypeToken(type);
    const tokenId = `${packageId}::${tokenName}` as PersistedTokenId;
    this.tokensById.set(tokenId, type);
    this.tokenIdsByToken.set(type, tokenId);
    return tokenId;
  }

  /**
   * Register all decorated runtime types discovered in workflows.
   */
  registerFromWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    for (const workflow of workflows) {
      for (const node of workflow.nodes) {
        this.registerDecoratedType(node.type);
        this.registerDecoratedType(node.config.type);
        this.registerNestedTypes(node.config);
      }
    }
  }

  private registerDecoratedType(type: TypeToken<unknown>): void {
    if (this.tokenIdsByToken.has(type)) {
      return;
    }
    const tokenId = PersistedRuntimeTypeIdFactory.fromMetadata({ type });
    if (!tokenId) {
      return;
    }
    this.tokensById.set(tokenId, type);
    this.tokenIdsByToken.set(type, tokenId);
  }

  private registerNestedTypes(value: unknown): void {
    if (Array.isArray(value)) {
      for (const entry of value) this.registerNestedTypes(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const type = this.asTypeToken(record.type);
    if (type) this.registerDecoratedType(type);
    for (const v of Object.values(record)) this.registerNestedTypes(v);
  }

  private displayNameForTypeToken(token: TypeToken<unknown>): string {
    if (typeof token === "function" && token.name) return token.name;
    if (typeof token === "string") return token;
    return "";
  }

  private asTypeToken(value: unknown): TypeToken<unknown> | undefined {
    if (typeof value === "function" || typeof value === "string" || typeof value === "symbol") {
      return value as TypeToken<unknown>;
    }
    return undefined;
  }

  getTokenId(token: TypeToken<unknown>): PersistedTokenId | undefined {
    const existing = this.tokenIdsByToken.get(token);
    if (existing) {
      return existing;
    }
    const tokenId = PersistedRuntimeTypeIdFactory.fromMetadata({ type: token });
    if (!tokenId) {
      return undefined;
    }
    this.tokensById.set(tokenId, token);
    this.tokenIdsByToken.set(token, tokenId);
    return tokenId;
  }

  resolve(tokenId: PersistedTokenId): TypeToken<unknown> | undefined {
    return this.tokensById.get(tokenId);
  }
}
