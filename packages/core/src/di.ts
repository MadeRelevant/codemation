export type TypeToken<T = unknown> = string | symbol | (new (...args: any[]) => T);

/**
 * Minimal container abstraction (tsyringe-compatible).
 */
export interface Container {
  resolve<T>(token: TypeToken<T>): T;
}

/**
 * Minimal dev container:
 * - supports class tokens by instantiating singletons
 * - throws for string/symbol tokens unless you provide a `providers` map
 */
export function createSimpleContainer(providers?: Map<TypeToken<any>, any>): Container {
  const singletons = providers ?? new Map<TypeToken<any>, any>();
  return {
    resolve<T>(token: TypeToken<T>): T {
      if (singletons.has(token)) return singletons.get(token);
      if (typeof token === "function") {
        const instance = new token();
        singletons.set(token, instance);
        return instance;
      }
      throw new Error(`No registration for token: ${String(token)}`);
    },
  };
}

