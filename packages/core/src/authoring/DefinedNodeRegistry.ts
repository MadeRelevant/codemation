import type { DefinedNode } from "./defineNode.types";

export class DefinedNodeRegistry {
  private static readonly definitions = new Map<
    string,
    DefinedNode<string, Record<string, unknown>, unknown, unknown>
  >();

  static register(definition: DefinedNode<string, Record<string, unknown>, unknown, unknown>): void {
    this.definitions.set(definition.key, definition);
  }

  static resolve(key: string): DefinedNode<string, Record<string, unknown>, unknown, unknown> | undefined {
    return this.definitions.get(key);
  }
}
