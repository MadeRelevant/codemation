import type { CollectionDefinition } from "./defineCollection.types";

export class DefinedCollectionRegistry {
  private static readonly definitions = new Map<string, CollectionDefinition>();

  static register(definition: CollectionDefinition): void {
    this.definitions.set(definition.name, definition);
  }

  static resolve(name: string): CollectionDefinition | undefined {
    return this.definitions.get(name);
  }

  static list(): ReadonlyArray<CollectionDefinition> {
    return Array.from(this.definitions.values());
  }
}
