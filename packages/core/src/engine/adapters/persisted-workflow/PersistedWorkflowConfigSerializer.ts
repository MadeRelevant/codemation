import type { TypeToken } from "../../../di";
import type { NodeConfigBase, PersistedTokenId, PersistedWorkflowTokenRegistryLike } from "../../../types";

export class PersistedWorkflowConfigSerializer {
  constructor(private readonly tokenRegistry: PersistedWorkflowTokenRegistryLike) {}

  create(config: NodeConfigBase): unknown {
    try {
      const cloned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
      this.injectTokenIds(cloned, config as unknown as Record<string, unknown>);
      return cloned;
    } catch {
      const fallback: Record<string, unknown> = {
        kind: config.kind,
        name: config.name,
        id: config.id,
        icon: config.icon,
        execution: config.execution,
      };
      this.injectTokenIds(fallback, config as unknown as Record<string, unknown>);
      return fallback;
    }
  }

  private injectTokenIds(target: Record<string, unknown>, source: Record<string, unknown>): void {
    const type = this.asTypeToken(source.type);
    if (type) {
      const tokenId = this.tokenRegistry.getTokenId(type) ?? this.tokenName(type);
      target.tokenId = tokenId;
    }
    for (const [key, value] of Object.entries(source)) {
      if (key === "type" || value == null) continue;
      if (Array.isArray(value)) {
        const arr = target[key];
        if (Array.isArray(arr)) {
          value.forEach((item, i) => {
            if (item && typeof item === "object" && arr[i] && typeof arr[i] === "object") {
              this.injectTokenIds(arr[i] as Record<string, unknown>, item as Record<string, unknown>);
            }
          });
        }
        continue;
      }
      if (typeof value === "object") {
        const t = target[key];
        if (t && typeof t === "object") {
          this.injectTokenIds(t as Record<string, unknown>, value as Record<string, unknown>);
        }
      }
    }
  }

  private tokenName(token: TypeToken<unknown>): PersistedTokenId {
    if (typeof token === "function" && token.name) return token.name as PersistedTokenId;
    if (typeof token === "string") return token as PersistedTokenId;
    return "unknown" as PersistedTokenId;
  }

  private asTypeToken(value: unknown): TypeToken<unknown> | undefined {
    if (typeof value === "function" || typeof value === "string" || typeof value === "symbol") {
      return value as TypeToken<unknown>;
    }
    return undefined;
  }
}

