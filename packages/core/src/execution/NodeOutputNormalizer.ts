import { isPortsEmission, isUnbrandedPortsEmissionShape } from "../contracts/emitPorts";
import type { PortsEmission } from "../contracts/emitPorts";
import type { Item, Items, JsonNonArray, NodeOutputs, OutputPortKey } from "../types";
import type { RunnableOutputBehavior } from "./RunnableOutputBehaviorResolver";

export class NodeOutputNormalizer {
  normalizeExecuteResult(
    args: Readonly<{
      baseItem: Item;
      raw: unknown;
      behavior: RunnableOutputBehavior;
    }>,
  ): NodeOutputs {
    const { baseItem, raw, behavior } = args;
    if (isPortsEmission(raw)) {
      return this.emitPortsToOutputs(baseItem, raw, behavior);
    }
    if (isUnbrandedPortsEmissionShape(raw)) {
      throw new Error(
        "execute() returned an unbranded `{ ports: ... }` object. Use emitPorts(...) for multi-port runnable outputs.",
      );
    }
    if (Array.isArray(raw)) {
      return this.arrayFanOutToMain(baseItem, raw, behavior);
    }
    if (this.isItemLike(raw)) {
      return { main: [this.applyOutput(baseItem, raw, behavior)] };
    }
    return {
      main: [this.applyOutput(baseItem, { json: raw as JsonNonArray }, behavior)],
    };
  }

  private arrayFanOutToMain(baseItem: Item, raw: readonly unknown[], behavior: RunnableOutputBehavior): NodeOutputs {
    for (const el of raw) {
      if (Array.isArray(el)) {
        throw new Error(
          "execute() fan-out arrays must contain only non-array JSON elements (nested arrays belong inside objects).",
        );
      }
    }
    const main: Item[] = raw.map((json) => this.applyOutput(baseItem, { json: json as JsonNonArray }, behavior));
    return { main };
  }

  private emitPortsToOutputs(baseItem: Item, emission: PortsEmission, behavior: RunnableOutputBehavior): NodeOutputs {
    const out: NodeOutputs = {};
    for (const [port, payload] of Object.entries(emission.ports)) {
      if (payload === undefined) {
        continue;
      }
      out[port as OutputPortKey] = this.normalizePortPayload(baseItem, payload, behavior);
    }
    return out;
  }

  private normalizePortPayload(
    baseItem: Item,
    payload: Items | ReadonlyArray<JsonNonArray>,
    behavior: RunnableOutputBehavior,
  ): Items {
    if (payload.length === 0) {
      return [];
    }
    const el0 = payload[0] as unknown;
    if (this.isItemLike(el0)) {
      return (payload as Items).map((it) => this.applyOutput(baseItem, it, behavior));
    }
    return (payload as readonly JsonNonArray[]).map((json) => this.applyOutput(baseItem, { json }, behavior));
  }

  private isItemLike(value: unknown): value is Item {
    return typeof value === "object" && value !== null && "json" in value;
  }

  private applyOutput(baseItem: Item, next: Item, behavior: RunnableOutputBehavior): Item {
    const explicitBinary = next.binary;
    return {
      json: next.json,
      ...(explicitBinary !== undefined
        ? { binary: explicitBinary }
        : behavior.keepBinaries && baseItem.binary
          ? { binary: baseItem.binary }
          : {}),
      ...(next.meta ? { meta: next.meta } : {}),
      ...(next.paired ? { paired: next.paired } : {}),
    };
  }
}
