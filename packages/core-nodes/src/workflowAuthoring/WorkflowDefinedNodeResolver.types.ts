import { DefinedNodeRegistry, type DefinedNode } from "@codemation/core";

export class WorkflowDefinedNodeResolver {
  static resolve(
    definitionOrKey: DefinedNode<string, Record<string, unknown>, unknown, unknown> | string,
  ): DefinedNode<string, Record<string, unknown>, unknown, unknown> {
    if (typeof definitionOrKey !== "string") {
      return definitionOrKey;
    }
    const definition = DefinedNodeRegistry.resolve(definitionOrKey);
    if (!definition) {
      throw new Error(`No helper-defined node with key "${definitionOrKey}" is registered in this module graph.`);
    }
    return definition;
  }
}
