import type { NodeExecutionContext } from "./runtimeTypes";
import type { Item, Items, NodeActivationId, NodeId, RunDataSnapshot, RunId, WorkflowId } from "./workflowTypes";

const ITEM_EXPR_BRAND = Symbol.for("codemation.itemExpr");

export type ItemExprResolvedContext = Readonly<{
  runId: RunId;
  workflowId: WorkflowId;
  nodeId: NodeId;
  activationId: NodeActivationId;
  data: RunDataSnapshot;
}>;

/**
 * Context aligned with former {@link ItemInputMapperContext} — use **`data`** to read any completed upstream node.
 */
export type ItemExprContext = ItemExprResolvedContext;

export type ItemExprArgs<TItemJson = unknown> = Readonly<{
  item: Item<TItemJson>;
  itemIndex: number;
  items: Items<TItemJson>;
  ctx: ItemExprContext;
}>;

export type ItemExprCallback<T, TItemJson = unknown> = (args: ItemExprArgs<TItemJson>) => T | Promise<T>;

export type ItemExpr<T, TItemJson = unknown> = Readonly<{
  readonly [ITEM_EXPR_BRAND]: true;
  readonly fn: ItemExprCallback<T, TItemJson>;
}>;

export function itemExpr<T, TItemJson = unknown>(fn: ItemExprCallback<T, TItemJson>): ItemExpr<T, TItemJson> {
  return { [ITEM_EXPR_BRAND]: true, fn };
}

export function isItemExpr<T, TItemJson = unknown>(value: unknown): value is ItemExpr<T, TItemJson> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<PropertyKey, unknown>;
  if (v[ITEM_EXPR_BRAND] === true) {
    return true;
  }
  // Support snapshot-hydrated itemExpr wrappers where the symbol brand was lost but the callback survived.
  // Workflow snapshot hydration currently restores function-valued fields (like `fn`) but may drop symbol-keyed brands.
  // We treat the minimal `{ fn: Function }` shape as an itemExpr wrapper to keep runnable configs working.
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "fn" && typeof (v as { fn?: unknown }).fn === "function") {
    return true;
  }
  for (const sym of Object.getOwnPropertySymbols(v)) {
    if (sym.description === "codemation.itemExpr" && v[sym] === true) {
      return true;
    }
  }
  return false;
}

function containsItemExprInUnknown(value: unknown, seen: WeakSet<object> = new WeakSet()): boolean {
  if (isItemExpr(value)) {
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
    return value.some((entry) => containsItemExprInUnknown(entry, seen));
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    if (containsItemExprInUnknown(entry, seen)) {
      return true;
    }
  }
  return false;
}

/**
 * Deep-resolves {@link itemExpr} leaves. Returns a new graph (does not mutate the original config object).
 */
export async function resolveItemExprsInUnknown(
  value: unknown,
  args: ItemExprArgs,
  seen: WeakSet<object> = new WeakSet(),
): Promise<unknown> {
  if (isItemExpr(value)) {
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
      out.push(await resolveItemExprsInUnknown(value[i], args, seen));
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
    out[k] = await resolveItemExprsInUnknown(v, args, seen);
  }
  return out;
}

/**
 * Clones runnable config (best-effort) so per-item {@link itemExpr} resolution never mutates shared instances.
 */
export async function resolveItemExprsForExecution(
  config: unknown,
  nodeCtx: NodeExecutionContext,
  item: Item,
  itemIndex: number,
  items: Items,
): Promise<unknown | undefined> {
  const exprArgs: ItemExprArgs = {
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
  if (!containsItemExprInUnknown(config)) {
    return undefined;
  }
  return await resolveItemExprsInUnknown(config, exprArgs);
}
