import type { NodeExecutionContext } from "./runtimeTypes";
import type { Item, Items, NodeActivationId, NodeId, RunDataSnapshot, RunId, WorkflowId } from "./workflowTypes";

const ITEM_VALUE_BRAND = Symbol.for("codemation.itemValue");

export type ItemValueResolvedContext = Readonly<{
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  activationId: NodeActivationId;
  data: RunDataSnapshot;
}>;

/**
 * Context aligned with former {@link ItemInputMapperContext} — use **`data`** to read any completed upstream node.
 */
export type ItemValueContext = ItemValueResolvedContext;

export type ItemValueArgs<TItemJson = unknown> = Readonly<{
  item: Item<TItemJson>;
  itemIndex: number;
  items: Items<TItemJson>;
  ctx: ItemValueContext;
}>;

export type ItemValueCallback<T, TItemJson = unknown> = (args: ItemValueArgs<TItemJson>) => T | Promise<T>;

export type ItemValue<T, TItemJson = unknown> = Readonly<{
  readonly [ITEM_VALUE_BRAND]: true;
  readonly fn: ItemValueCallback<T, TItemJson>;
}>;

export function itemValue<T, TItemJson = unknown>(fn: ItemValueCallback<T, TItemJson>): ItemValue<T, TItemJson> {
  return { [ITEM_VALUE_BRAND]: true, fn };
}

export function isItemValue<T, TItemJson = unknown>(value: unknown): value is ItemValue<T, TItemJson> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<PropertyKey, unknown>;
  if (v[ITEM_VALUE_BRAND] === true) {
    return true;
  }
  // Support snapshot-hydrated itemValue wrappers where the symbol brand was lost but the callback survived.
  // Workflow snapshot hydration currently restores function-valued fields (like `fn`) but may drop symbol-keyed brands.
  // We treat the minimal `{ fn: Function }` shape as an itemValue wrapper to keep runnable configs working.
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "fn" && typeof (v as { fn?: unknown }).fn === "function") {
    return true;
  }
  // Support legacy module-local Symbol("codemation.itemValue") brands (e.g. duplicate module graphs).
  for (const sym of Object.getOwnPropertySymbols(v)) {
    if (sym.description === "codemation.itemValue" && v[sym] === true) {
      return true;
    }
  }
  return false;
}

function containsItemValueInUnknown(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (isItemValue(value)) {
    return true;
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value as object)) {
    return false;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.some((entry) => containsItemValueInUnknown(entry, seen));
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (containsItemValueInUnknown(entry, seen)) {
      return true;
    }
  }
  return false;
}

/**
 * Deep-resolves {@link itemValue} leaves. Returns a new graph (does not mutate the original config object).
 */
export async function resolveItemValuesInUnknown(
  value: unknown,
  args: ItemValueArgs,
  seen: WeakSet<object> = new WeakSet(),
): Promise<unknown> {
  if (isItemValue(value)) {
    return await Promise.resolve(value.fn(args));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      out.push(await resolveItemValuesInUnknown(value[i], args, seen));
    }
    return out;
  }
  const rec = value as Record<string, unknown>;
  const entries = Object.entries(rec);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && entries.length === 0) {
    return value;
  }
  const out = Object.create(proto) as Record<string, unknown>;
  for (const [k, v] of entries) {
    out[k] = await resolveItemValuesInUnknown(v, args, seen);
  }
  return out;
}

/**
 * Clones runnable config (best-effort) so per-item {@link itemValue} resolution never mutates shared instances.
 */
export async function resolveItemValuesForExecution(
  config: unknown,
  nodeCtx: NodeExecutionContext,
  item: Item,
  itemIndex: number,
  items: Items,
): Promise<unknown | undefined> {
  const ivArgs: ItemValueArgs = {
    item,
    itemIndex,
    items,
    ctx: {
      runId: nodeCtx.runId,
      workflowId: nodeCtx.workflowId,
      nodeId: nodeCtx.nodeId,
      activationId: nodeCtx.activationId,
      data: nodeCtx.data,
    },
  };
  if (!containsItemValueInUnknown(config)) {
    return undefined;
  }
  return await resolveItemValuesInUnknown(config, ivArgs);
}
