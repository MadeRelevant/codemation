import type { InputPortKey, Item, Items, NodeInputsByPort } from "../types";

import { getOriginIndexFromItem } from "../contracts/itemMeta";

/**
 * Default fan-in: combine multi-port {@link NodeInputsByPort} into one {@link Items} batch for per-item nodes.
 *
 * This is used when a single-input per-item node has multiple inbound edges (for example, branch reconverge
 * after an `If` / `Switch`). The default behavior is **append / union** (preserving item payloads) with a
 * deterministic order:
 *
 * - When router origin metadata exists (`meta._cm.originIndex`), items are sorted by origin index so the
 *   downstream batch preserves original ordering across branches.
 * - Otherwise, items are appended by port-key order, preserving each port's local order.
 */
export class FanInMergeByOriginMerger {
  merge(inputsByPort: NodeInputsByPort): Items {
    const portKeys = Object.keys(inputsByPort).sort();
    if (portKeys.length === 0) {
      return [];
    }
    if (portKeys.length === 1) {
      const only = portKeys[0]!;
      return [...(inputsByPort[only] ?? [])];
    }

    type Entry = Readonly<{
      portKey: InputPortKey;
      portIndex: number;
      item: Item;
      originIndex: number | undefined;
    }>;

    const entries: Entry[] = [];
    let anyOrigin = false;

    for (let p = 0; p < portKeys.length; p++) {
      const portKey = portKeys[p]!;
      const items = inputsByPort[portKey] ?? [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as Item;
        const originIndex = getOriginIndexFromItem(item);
        if (originIndex !== undefined) {
          anyOrigin = true;
        }
        entries.push({ portKey, portIndex: i, item, originIndex });
      }
    }

    if (!anyOrigin) {
      return entries.map((e) => e.item);
    }

    const missingOriginRank = Number.MAX_SAFE_INTEGER;
    return entries
      .slice()
      .sort((a, b) => {
        const ao = a.originIndex ?? missingOriginRank;
        const bo = b.originIndex ?? missingOriginRank;
        if (ao !== bo) return ao - bo;
        const pk = a.portKey.localeCompare(b.portKey);
        if (pk !== 0) return pk;
        return a.portIndex - b.portIndex;
      })
      .map((e) => e.item);
  }
}
