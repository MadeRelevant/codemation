import type { TypeToken } from "../di";
import type {
  NodeConfigBase,
  PersistedTokenId,
  PersistedWorkflowSnapshot,
  PersistedWorkflowSnapshotNode,
  PersistedWorkflowTokenRegistryLike,
  WorkflowDefinition,
} from "../types";

export class WorkflowSnapshotCodec {
  constructor(private readonly tokenRegistry: PersistedWorkflowTokenRegistryLike) {}

  create(workflow: WorkflowDefinition): PersistedWorkflowSnapshot {
    return {
      id: workflow.id,
      name: workflow.name,
      workflowErrorHandlerConfigured: workflow.workflowErrorHandler !== undefined,
      ...(workflow.connections !== undefined && workflow.connections.length > 0
        ? { connections: workflow.connections }
        : {}),
      nodes: workflow.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        name: node.name,
        nodeTokenId: this.resolveTokenId(node.type),
        configTokenId: this.resolveTokenId(node.config.type),
        tokenName: this.resolveTokenName(node.type),
        configTokenName: this.resolveTokenName(node.config.type),
        config: this.serializeConfig(node.config),
      })),
      edges: workflow.edges.map((edge) => ({
        from: { nodeId: edge.from.nodeId, output: edge.from.output },
        to: { nodeId: edge.to.nodeId, input: edge.to.input },
      })),
    };
  }

  hydrate(snapshotNode: PersistedWorkflowSnapshotNode, liveConfig: NodeConfigBase): NodeConfigBase {
    const hydrated = this.mergeValue(liveConfig, snapshotNode.config);
    const configToken = this.tokenRegistry.resolve(snapshotNode.configTokenId);
    Object.assign(hydrated, {
      type: configToken ?? liveConfig.type,
      kind: snapshotNode.kind,
    });
    if (snapshotNode.name && !("name" in hydrated && hydrated.name)) {
      Object.assign(hydrated, { name: snapshotNode.name });
    }
    return hydrated as unknown as NodeConfigBase;
  }

  private serializeConfig(config: NodeConfigBase): unknown {
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
      target.tokenId = this.tokenRegistry.getTokenId(type) ?? this.resolveTokenName(type) ?? "unknown";
    }
    for (const [key, value] of Object.entries(source)) {
      if (key === "type" || value == null) {
        continue;
      }
      if (Array.isArray(value)) {
        const targetArray = target[key];
        if (Array.isArray(targetArray)) {
          value.forEach((item, index) => {
            if (item && typeof item === "object" && targetArray[index] && typeof targetArray[index] === "object") {
              this.injectTokenIds(targetArray[index] as Record<string, unknown>, item as Record<string, unknown>);
            }
          });
        }
        continue;
      }
      if (typeof value === "object") {
        const targetValue = target[key];
        if (targetValue && typeof targetValue === "object") {
          this.injectTokenIds(targetValue as Record<string, unknown>, value as Record<string, unknown>);
        }
      }
    }
  }

  private mergeValue(liveValue: unknown, snapshotValue: unknown): Record<PropertyKey, unknown> {
    const liveRecord = this.asRecord(liveValue);
    const snapshotRecord = this.asRecord(snapshotValue);
    const hydrated = Object.create(
      liveValue && typeof liveValue === "object"
        ? (Object.getPrototypeOf(liveValue) ?? Object.prototype)
        : Object.prototype,
    ) as Record<PropertyKey, unknown>;

    for (const [key, value] of Object.entries(snapshotRecord)) {
      hydrated[key] = this.mergeNestedValue(liveRecord[key], value);
    }

    this.restoreNonSerializableProperties(liveRecord, hydrated);
    this.restoreTypeProperty(hydrated);
    return hydrated;
  }

  private mergeNestedValue(liveValue: unknown, snapshotValue: unknown): unknown {
    if (Array.isArray(snapshotValue)) {
      const liveArray = Array.isArray(liveValue) ? liveValue : [];
      return snapshotValue.map((entry, index) => this.mergeNestedValue(liveArray[index], entry));
    }
    if (snapshotValue && typeof snapshotValue === "object") {
      return this.mergeValue(liveValue, snapshotValue);
    }
    return snapshotValue;
  }

  private restoreNonSerializableProperties(
    liveRecord: Record<PropertyKey, unknown>,
    hydrated: Record<PropertyKey, unknown>,
  ): void {
    for (const [key, value] of Object.entries(liveRecord)) {
      if (typeof value === "function" || typeof value === "symbol") {
        hydrated[key] = value;
      }
    }
    // Preserve symbol-keyed brands (e.g. itemValue / emitPorts) and other runtime-only keys.
    for (const sym of Object.getOwnPropertySymbols(liveRecord)) {
      hydrated[sym] = liveRecord[sym];
    }
  }

  private restoreTypeProperty(record: Record<PropertyKey, unknown>): void {
    const tokenId = typeof record.tokenId === "string" ? record.tokenId : undefined;
    if (!tokenId) {
      return;
    }
    const type = this.tokenRegistry.resolve(tokenId as PersistedTokenId);
    if (type) {
      record.type = type;
    }
  }

  private resolveTokenId(token: TypeToken<unknown>): PersistedTokenId {
    return (this.tokenRegistry.getTokenId(token) ?? this.resolveTokenName(token) ?? "unknown") as PersistedTokenId;
  }

  private resolveTokenName(token: TypeToken<unknown>): string | undefined {
    if (typeof token === "function" && token.name) {
      return token.name;
    }
    if (typeof token === "string") {
      return token;
    }
    return undefined;
  }

  private asTypeToken(value: unknown): TypeToken<unknown> | undefined {
    if (typeof value === "function" || typeof value === "string" || typeof value === "symbol") {
      return value as TypeToken<unknown>;
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<PropertyKey, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    const record = value as Record<PropertyKey, unknown>;
    const out: Record<PropertyKey, unknown> = { ...(record as Record<string, unknown>) };
    for (const sym of Object.getOwnPropertySymbols(value)) {
      out[sym] = record[sym];
    }
    return out;
  }
}
