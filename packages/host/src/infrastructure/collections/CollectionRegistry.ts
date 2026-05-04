import { inject, injectable } from "@codemation/core";
import type { CollectionDefinition } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";

/**
 * Singleton registry that exposes the declared collection definitions from AppConfig.
 * Injected by tsyringe; constructed once per app container.
 */
@injectable()
export class CollectionRegistry {
  private readonly definitions: Map<string, CollectionDefinition>;

  constructor(
    @inject(ApplicationTokens.AppConfig)
    appConfig: AppConfig,
  ) {
    this.definitions = new Map();
    for (const definition of appConfig.collections) {
      this.definitions.set(definition.name, definition);
    }
  }

  resolve(name: string): CollectionDefinition | undefined {
    return this.definitions.get(name);
  }

  list(): ReadonlyArray<CollectionDefinition> {
    return Array.from(this.definitions.values());
  }

  has(name: string): boolean {
    return this.definitions.has(name);
  }
}
