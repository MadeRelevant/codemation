import type { MutableRunData,NodeId,NodeOutputs,RunDataFactory } from "../../types";
import { InMemoryRunData } from "./inMemoryRunData";

export class InMemoryRunDataFactory implements RunDataFactory {
  create(initial?: Record<NodeId, NodeOutputs>): MutableRunData {
    return new InMemoryRunData(initial);
  }
}

