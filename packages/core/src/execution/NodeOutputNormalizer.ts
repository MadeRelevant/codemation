import { isPortsEmission, isUnbrandedPortsEmissionShape } from "../contracts/emitPorts";
import type { PortsEmission } from "../contracts/emitPorts";
import type { Item, JsonNonArray, LineageCarryPolicy, NodeOutputs, OutputPortKey, Items } from "../types";

export class NodeOutputNormalizer {
  normalizeExecuteResult(
    args: Readonly<{
      baseItem: Item;
      raw: unknown;
      carry: LineageCarryPolicy;
    }>,
  ): NodeOutputs {
    const { baseItem, raw, carry } = args;
    if (isPortsEmission(raw)) {
      return this.emitPortsToOutputs(baseItem, raw, carry);
    }
    if (isUnbrandedPortsEmissionShape(raw)) {
      throw new Error(
        "execute() returned an unbranded `{ ports: ... }` object. Use emitPorts(...) for multi-port runnable outputs.",
      );
    }
    if (Array.isArray(raw)) {
      return this.arrayFanOutToMain(baseItem, raw, carry);
    }
    if (this.isItemLike(raw)) {
      return { main: [this.applyLineage(baseItem, raw, carry)] };
    }
    return {
      main: [this.applyLineage(baseItem, { json: raw as JsonNonArray }, carry)],
    };
  }

  private arrayFanOutToMain(baseItem: Item, raw: readonly unknown[], carry: LineageCarryPolicy): NodeOutputs {
    for (const el of raw) {
      if (Array.isArray(el)) {
        throw new Error(
          "execute() fan-out arrays must contain only non-array JSON elements (nested arrays belong inside objects).",
        );
      }
    }
    const main: Item[] = raw.map((json) => this.applyLineage(baseItem, { json: json as JsonNonArray }, carry));
    return { main };
  }

  private emitPortsToOutputs(baseItem: Item, emission: PortsEmission, carry: LineageCarryPolicy): NodeOutputs {
    const out: NodeOutputs = {};
    for (const [port, payload] of Object.entries(emission.ports)) {
      if (payload === undefined) {
        continue;
      }
      out[port as OutputPortKey] = this.normalizePortPayload(baseItem, payload, carry);
    }
    return out;
  }

  private normalizePortPayload(
    baseItem: Item,
    payload: Items | ReadonlyArray<JsonNonArray>,
    carry: LineageCarryPolicy,
  ): Items {
    if (payload.length === 0) {
      return [];
    }
    const el0 = payload[0] as unknown;
    if (this.isItemLike(el0)) {
      return (payload as Items).map((it) => this.applyLineage(baseItem, it, carry));
    }
    return (payload as readonly JsonNonArray[]).map((json) => this.applyLineage(baseItem, { json }, carry));
  }

  private isItemLike(value: unknown): value is Item {
    return typeof value === "object" && value !== null && "json" in value;
  }

  private applyLineage(baseItem: Item, next: Item, carry: LineageCarryPolicy): Item {
    if (carry === "carryThrough") {
      return {
        ...baseItem,
        ...next,
        json: next.json,
      };
    }
    return {
      json: next.json,
      ...(next.binary ? { binary: next.binary } : {}),
      ...(next.meta ? { meta: next.meta } : {}),
      ...(next.paired ? { paired: next.paired } : {}),
    };
  }
}
