import type { InputPortKey, Item, Items, NodeId } from "@codemation/core";
import { getOriginIndexFromItem } from "@codemation/core";

export function getOriginIndex(item: Item): number | undefined {
  return getOriginIndexFromItem(item);
}

/**
 * Tags items routed to fan-in merge-by-origin (same contract as {@link IfNode} / {@link SwitchNode}).
 */
export function tagItemForRouterFanIn<TJson>(
  args: Readonly<{
    item: Item<TJson>;
    itemIndex: number;
    nodeId: NodeId;
    inputPortLabel?: string;
  }>,
): Item<TJson> {
  const { item, itemIndex, nodeId, inputPortLabel = "$in" } = args;
  const metaBase = (item.meta && typeof item.meta === "object" ? (item.meta as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  const cmBase =
    metaBase._cm && typeof metaBase._cm === "object"
      ? (metaBase._cm as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const originIndex = typeof cmBase.originIndex === "number" ? (cmBase.originIndex as number) : itemIndex;
  return {
    ...item,
    meta: { ...metaBase, _cm: { ...cmBase, originIndex } },
    paired: [{ nodeId, output: inputPortLabel, itemIndex: originIndex }, ...(item.paired ?? [])],
  };
}

export function orderedInputs(
  inputsByPort: Readonly<Record<InputPortKey, Items>>,
  prefer?: ReadonlyArray<InputPortKey>,
): InputPortKey[] {
  const keys = Object.keys(inputsByPort);
  const preferred = (prefer ?? []).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !preferred.includes(k)).sort();
  return [...preferred, ...rest];
}
