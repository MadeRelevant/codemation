import type { NodeConfigBase, PersistedWorkflowSnapshotNode, PersistedWorkflowTokenRegistryLike } from "../../../types";

export class PersistedWorkflowConfigHydrator {
  constructor(private readonly tokenRegistry: PersistedWorkflowTokenRegistryLike) {}

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

  private mergeValue(liveValue: unknown, snapshotValue: unknown): Record<string, unknown> {
    const liveRecord = this.asRecord(liveValue);
    const snapshotRecord = this.asRecord(snapshotValue);
    const hydrated = Object.create(
      liveValue && typeof liveValue === "object" ? (Object.getPrototypeOf(liveValue) ?? Object.prototype) : Object.prototype,
    ) as Record<string, unknown>;

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

  private restoreNonSerializableProperties(liveRecord: Record<string, unknown>, hydrated: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(liveRecord)) {
      if (typeof value === "function" || typeof value === "symbol") {
        hydrated[key] = value;
      }
    }
  }

  private restoreTypeProperty(record: Record<string, unknown>): void {
    const tokenId = typeof record.tokenId === "string" ? record.tokenId : undefined;
    if (!tokenId) {
      return;
    }
    const type = this.tokenRegistry.resolve(tokenId);
    if (type) {
      record.type = type;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return { ...(value as Record<string, unknown>) };
  }
}

