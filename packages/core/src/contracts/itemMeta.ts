import type { Item } from "./workflowTypes";

/**
 * Reads `meta._cm.originIndex` when present (used for fan-in merge-by-origin and Merge routing).
 */
export function getOriginIndexFromItem(item: Item): number | undefined {
  const meta = item.meta as Record<string, unknown> | undefined;
  const cm = meta?._cm as Record<string, unknown> | undefined;
  const v = cm?.originIndex;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
