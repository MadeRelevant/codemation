import type { ConnectionInvocationRecord } from "../../hooks/realtime/realtime";

/**
 * Navigation model for the inspector's "focused item" mode.
 *
 * Selecting a single invocation in the bottom execution tree focuses the **item** (per-trigger
 * iteration) it belongs to — not the individual invocation. The inspector then shows every
 * invocation that ran for that item as a single subtree, and prev/next navigate between items
 * (not individual invocations). When the node has only one item the navigation is omitted by the
 * caller, since stepping is degenerate.
 */
export type FocusedItemNavigationModel = Readonly<{
  /** All invocations belonging to the focused item, sorted by start time. */
  itemInvocations: ReadonlyArray<ConnectionInvocationRecord>;
  /** Stable identifier for the focused item (iterationId, legacy fallback, or unscoped marker). */
  itemBucketKey: string;
  /** 1-based index of the focused item among item groups for this node. */
  itemNumber: number;
  /** Total item groups for this node. */
  totalItems: number;
  /** First invocation id of the previous item (for prev-button targeting), or null at first item. */
  prevItemFirstInvocationId: string | null;
  /** First invocation id of the next item (for next-button targeting), or null at last item. */
  nextItemFirstInvocationId: string | null;
}>;

export class FocusedInvocationModelFactory {
  /**
   * Resolves "focused item" navigation metadata. The focused id is used only to locate the **item
   * bucket** that owns it; the model's payload is the entire bucket of invocations.
   *
   * Groups by `iterationId` (per-item identity minted by the engine), falling back to
   * `legacy::<parentAgentActivationId>::<itemIndex>` when iteration ids are missing. Buckets are
   * ordered by `itemIndex` first (deterministic across parallel items), then by earliest start.
   * Returns `undefined` when the focused id is not present in `nodeInvocations` so the caller can
   * fall back to the all-items grouped accordion.
   */
  static create(
    args: Readonly<{
      nodeInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      focusedInvocationId: string;
    }>,
  ): FocusedItemNavigationModel | undefined {
    const { nodeInvocations, focusedInvocationId } = args;

    if (!nodeInvocations.some((inv) => inv.invocationId === focusedInvocationId)) {
      return undefined;
    }

    const unscopedKey = "__unscoped__";
    const bucketKey = (inv: ConnectionInvocationRecord): string => {
      if (typeof inv.iterationId === "string" && inv.iterationId.length > 0) {
        return inv.iterationId;
      }
      if (typeof inv.parentAgentActivationId === "string" && inv.parentAgentActivationId.length > 0) {
        return `legacy::${inv.parentAgentActivationId}::${String(inv.itemIndex ?? 0)}`;
      }
      return unscopedKey;
    };

    const groups = new Map<string, ConnectionInvocationRecord[]>();
    for (const inv of nodeInvocations) {
      const key = bucketKey(inv);
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(inv);
      } else {
        groups.set(key, [inv]);
      }
    }

    const getTime = (inv: ConnectionInvocationRecord): string => inv.startedAt ?? inv.queuedAt ?? inv.updatedAt;
    const compareTime = (a: string, b: string): number => a.localeCompare(b);

    const groupItemIndex = (group: ReadonlyArray<ConnectionInvocationRecord>): number | undefined => {
      for (const inv of group) {
        if (typeof inv.itemIndex === "number") return inv.itemIndex;
      }
      return undefined;
    };

    const sortedGroups: Array<readonly [string, ReadonlyArray<ConnectionInvocationRecord>]> = [...groups.entries()]
      .map(([key, invs]) => {
        const sortedInvs = [...invs].sort((left, right) => compareTime(getTime(left), getTime(right)));
        return [key, sortedInvs] as const;
      })
      .sort(([, leftInvs], [, rightInvs]) => {
        const leftIndex = groupItemIndex(leftInvs);
        const rightIndex = groupItemIndex(rightInvs);
        if (leftIndex !== rightIndex) {
          if (leftIndex === undefined) return 1;
          if (rightIndex === undefined) return -1;
          return leftIndex - rightIndex;
        }
        const leftEarliest = getTime(leftInvs[0]!);
        const rightEarliest = getTime(rightInvs[0]!);
        return compareTime(leftEarliest, rightEarliest);
      });

    const focusedGroupIndex = sortedGroups.findIndex(([, invs]) =>
      invs.some((inv) => inv.invocationId === focusedInvocationId),
    );
    if (focusedGroupIndex === -1) {
      return undefined;
    }

    const totalItems = sortedGroups.length;
    const [focusedKey, focusedInvocations] = sortedGroups[focusedGroupIndex]!;
    const prevGroup = focusedGroupIndex > 0 ? sortedGroups[focusedGroupIndex - 1] : undefined;
    const nextGroup = focusedGroupIndex < sortedGroups.length - 1 ? sortedGroups[focusedGroupIndex + 1] : undefined;

    return {
      itemInvocations: focusedInvocations,
      itemBucketKey: focusedKey,
      itemNumber: focusedGroupIndex + 1,
      totalItems,
      prevItemFirstInvocationId: prevGroup?.[1][0]?.invocationId ?? null,
      nextItemFirstInvocationId: nextGroup?.[1][0]?.invocationId ?? null,
    };
  }
}
