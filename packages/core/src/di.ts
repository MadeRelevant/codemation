import "reflect-metadata";
import type { DependencyContainer } from "tsyringe";
import { container as tsyringeContainer } from "tsyringe";

export type TypeToken<T = unknown> = string | symbol | (new (...args: any[]) => T);

/**
 * Minimal container abstraction (tsyringe-compatible).
 */
export interface Container {
  resolve<T>(token: TypeToken<T>): T;
}

export type CodemationContainer = DependencyContainer & Container;

export class CodemationContainerFactory {
  /**
   * Creates a container isolated from tsyringe's global root container.
   * Consumers should register their nodes/services on the returned container.
   */
  static create(): CodemationContainer {
    return tsyringeContainer.createChildContainer() as CodemationContainer;
  }
}

/**
 * Minimal dev/test container:
 * - supports class tokens by instantiating singletons
 * - throws for string/symbol tokens unless you provide a `providers` map
 */
export class SimpleContainer implements Container {
  private readonly singletons: Map<TypeToken<unknown>, unknown>;

  constructor(providers?: Map<TypeToken<unknown>, unknown>) {
    this.singletons = providers ?? new Map<TypeToken<unknown>, unknown>();
  }

  resolve<T>(token: TypeToken<T>): T {
    if (this.singletons.has(token)) return this.singletons.get(token) as T;
    if (typeof token === "function") {
      const instance = new token();
      this.singletons.set(token, instance as unknown);
      return instance;
    }
    throw new Error(`No registration for token: ${String(token)}`);
  }
}

export class SimpleContainerFactory {
  static create(providers?: Map<TypeToken<unknown>, unknown>): Container {
    return new SimpleContainer(providers);
  }
}

