import type { TypeToken } from "../../../di";


import type { PersistedTokenId,PersistedWorkflowTokenRegistryLike,WorkflowDefinition } from "../../../types";

import { PersistedWorkflowTokenRegistry } from "./PersistedWorkflowTokenRegistry";



export class PersistedWorkflowTokenRegistryProxyAdapter extends PersistedWorkflowTokenRegistry {
  constructor(
    private readonly concreteRegistry: PersistedWorkflowTokenRegistry,
    private readonly delegateRegistry: PersistedWorkflowTokenRegistryLike,
  ) {
    super();
  }

  override register(type: TypeToken<unknown>, packageId: string, persistedNameOverride?: string): PersistedTokenId {
    const tokenId = this.delegateRegistry.register(type, packageId, persistedNameOverride);
    this.concreteRegistry.register(type, packageId, persistedNameOverride);
    return tokenId;
  }

  override registerFromWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): void {
    this.delegateRegistry.registerFromWorkflows?.(workflows);
    this.concreteRegistry.registerFromWorkflows(workflows);
  }

  override getTokenId(token: TypeToken<unknown>): PersistedTokenId | undefined {
    return this.delegateRegistry.getTokenId(token) ?? this.concreteRegistry.getTokenId(token);
  }

  override resolve(tokenId: PersistedTokenId): TypeToken<unknown> | undefined {
    return this.delegateRegistry.resolve(tokenId) ?? this.concreteRegistry.resolve(tokenId);
  }
}
