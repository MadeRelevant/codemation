import type { InputPortKey,Item,Items,MultiInputNode,NodeExecutionContext,NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import type { Merge } from "./merge";
import { getOriginIndex,orderedInputs } from "./mergeExecutionUtils";

@node({ packageName: "@codemation/core-nodes" })
export class MergeNode implements MultiInputNode<Merge<any, any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async executeMulti(inputsByPort: Readonly<Record<InputPortKey, Items>>, ctx: NodeExecutionContext<Merge<any, any>>): Promise<NodeOutputs> {
    const order = orderedInputs(inputsByPort, ctx.config.cfg.prefer);

    if (ctx.config.cfg.mode === "append") {
      const out: Item[] = [];
      for (const k of order) out.push(...(inputsByPort[k] ?? []));
      return { main: out };
    }

    if (ctx.config.cfg.mode === "mergeByPosition") {
      let maxLen = 0;
      for (const k of order) maxLen = Math.max(maxLen, (inputsByPort[k] ?? []).length);

      const out: Item[] = [];
      for (let i = 0; i < maxLen; i++) {
        const json: Record<string, unknown> = {};
        const paired: any[] = [];
        let meta: Record<string, unknown> | undefined;

        for (const k of order) {
          const item = (inputsByPort[k] ?? [])[i];
          json[k] = item?.json;
          if (item?.paired) paired.push(...item.paired);
          if (!meta && item?.meta) meta = { ...(item.meta as any) };
        }

        const merged: any = { json };
        if (paired.length > 0) merged.paired = paired;
        if (meta) merged.meta = meta;
        out.push(merged as Item);
      }

      return { main: out };
    }

    // passThrough (default): for each origin index, take first available input (deterministic input precedence).
    const chosenByOrigin = new Map<number, Item>();
    const fallback: Item[] = [];

    for (const k of order) {
      for (const item of inputsByPort[k] ?? []) {
        const origin = getOriginIndex(item);
        if (origin === undefined) {
          fallback.push(item);
          continue;
        }
        if (!chosenByOrigin.has(origin)) chosenByOrigin.set(origin, item);
      }
    }

    const out: Item[] = [];
    const origins = Array.from(chosenByOrigin.keys()).sort((a, b) => a - b);
    for (const o of origins) out.push(chosenByOrigin.get(o)!);
    out.push(...fallback);

    return { main: out };
  }
}
