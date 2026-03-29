import {
  PersistedRuntimeTypeDecoratorDefaults,
  persistedRuntimeTypeMetadataKey,
  type DecoratedRuntimeType,
  type PersistedRuntimeTypeDecoratorOptions,
  type PersistedRuntimeTypeKind,
  type PersistedRuntimeTypeMetadata,
} from "./persistedRuntimeTypeModelRegistry";
import { PersistedRuntimeTypeNameResolver } from "./PersistedRuntimeTypeNameResolver";
import { StackTraceCallSitePathResolver } from "./StackTraceCallSitePathResolver";

/**
 * Defines and retrieves persisted runtime metadata on decorated classes.
 * The metadata is attached as a non-enumerable property so runtime objects stay serializable.
 */
export class PersistedRuntimeTypeMetadataStore {
  static define(
    target: DecoratedRuntimeType,
    kind: PersistedRuntimeTypeKind,
    options: PersistedRuntimeTypeDecoratorOptions,
    decoratorFileUrl: string,
  ): void {
    const normalizedOptions = PersistedRuntimeTypeDecoratorDefaults.apply(options);
    const metadata: PersistedRuntimeTypeMetadata = {
      persistedName: PersistedRuntimeTypeNameResolver.resolve(target, normalizedOptions.name),
      kind,
      packageName: normalizedOptions.packageName ?? PersistedRuntimeTypeDecoratorDefaults.appPackageName,
      sourceHint: normalizedOptions.moduleUrl ?? StackTraceCallSitePathResolver.resolve(decoratorFileUrl),
    };
    Object.defineProperty(target, persistedRuntimeTypeMetadataKey, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: metadata,
    });
  }

  static get(target: unknown): PersistedRuntimeTypeMetadata | undefined {
    if (!target || (typeof target !== "function" && typeof target !== "object")) {
      return undefined;
    }
    return (target as Record<PropertyKey, unknown>)[persistedRuntimeTypeMetadataKey] as
      | PersistedRuntimeTypeMetadata
      | undefined;
  }
}
