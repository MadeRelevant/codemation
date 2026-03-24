import type { BinaryAttachment, Items, PersistedRunState } from "@codemation/core";

/**
 * Collects every `storageKey` referenced by binary attachments embedded in persisted run state
 * (outputs, node snapshots, mutable debugger state).
 */
export class RunStateBinaryStorageKeysCollector {
  collectFromRunState(state: PersistedRunState): ReadonlySet<string> {
    const keys = new Set<string>();
    this.addFromOutputsByNode(state.outputsByNode, keys);
    this.addFromNodeSnapshots(state, keys);
    this.addFromMutableState(state.mutableState, keys);
    return keys;
  }

  private addFromOutputsByNode(outputsByNode: PersistedRunState["outputsByNode"], keys: Set<string>): void {
    for (const outputs of Object.values(outputsByNode)) {
      for (const items of Object.values(outputs)) {
        this.addFromItems(items, keys);
      }
    }
  }

  private addFromNodeSnapshots(state: PersistedRunState, keys: Set<string>): void {
    for (const snapshot of Object.values(state.nodeSnapshotsByNodeId)) {
      this.addFromPortMap(snapshot.inputsByPort, keys);
      this.addFromPortMap(snapshot.outputs, keys);
    }
  }

  private addFromMutableState(mutableState: PersistedRunState["mutableState"], keys: Set<string>): void {
    for (const nodeState of Object.values(mutableState?.nodesById ?? {})) {
      this.addFromPortMap(nodeState.pinnedOutputsByPort, keys);
      this.addFromItems(nodeState.lastDebugInput, keys);
    }
  }

  private addFromPortMap(itemMap: Readonly<Partial<Record<string, Items>>> | undefined, keys: Set<string>): void {
    for (const items of Object.values(itemMap ?? {})) {
      this.addFromItems(items, keys);
    }
  }

  private addFromItems(items: Items | undefined, keys: Set<string>): void {
    for (const item of items ?? []) {
      for (const attachment of Object.values(item.binary ?? {})) {
        this.addAttachment(attachment, keys);
      }
    }
  }

  private addAttachment(attachment: BinaryAttachment, keys: Set<string>): void {
    if (attachment.storageKey.length > 0) {
      keys.add(attachment.storageKey);
    }
  }
}
