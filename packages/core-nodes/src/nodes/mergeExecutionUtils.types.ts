import type { InputPortKey, Item, Items } from "@codemation/core";

export function getOriginIndex(item: Item): number | undefined {
  const meta = item.meta as Record<string, unknown> | undefined;
  const cm = meta?._cm as Record<string, unknown> | undefined;
  const v = cm?.originIndex;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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
