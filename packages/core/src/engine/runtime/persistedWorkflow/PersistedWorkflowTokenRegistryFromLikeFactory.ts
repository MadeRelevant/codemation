import type { PersistedWorkflowTokenRegistryLike } from "../../../types";

import { PersistedWorkflowTokenRegistry } from "./PersistedWorkflowTokenRegistry";
import { PersistedWorkflowTokenRegistryProxyAdapter } from "./PersistedWorkflowTokenRegistryProxyAdapter";

export class PersistedWorkflowTokenRegistryFromLikeFactory {
  static fromLike(registry: PersistedWorkflowTokenRegistryLike): PersistedWorkflowTokenRegistry {
    if (registry instanceof PersistedWorkflowTokenRegistry) {
      return registry;
    }
    const concreteRegistry = new PersistedWorkflowTokenRegistry();
    return new PersistedWorkflowTokenRegistryProxyAdapter(concreteRegistry, registry);
  }
}
