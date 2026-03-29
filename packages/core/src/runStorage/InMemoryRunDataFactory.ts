import type { MutableRunData, NodeId, NodeOutputs, RunDataFactory } from "../types";
import { InMemoryRunData } from "./InMemoryRunData";

export class InMemoryRunDataFactory implements RunDataFactory {
  create(initial?: Record<NodeId, NodeOutputs>): MutableRunData {
    return new InMemoryRunData(initial);
  }
}
