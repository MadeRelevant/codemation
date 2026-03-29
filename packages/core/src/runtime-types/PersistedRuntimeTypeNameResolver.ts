import type { DecoratedRuntimeType } from "./persistedRuntimeTypeModelRegistry";

/** Resolves the persisted type name from either an explicit override or the class name itself. */
export class PersistedRuntimeTypeNameResolver {
  static resolve(target: DecoratedRuntimeType, override: string | undefined): string {
    const resolved = override ?? target.name;
    if (!resolved) {
      throw new Error(
        "Persisted runtime token metadata requires a named class or an explicit decorator name override.",
      );
    }
    return resolved;
  }
}
