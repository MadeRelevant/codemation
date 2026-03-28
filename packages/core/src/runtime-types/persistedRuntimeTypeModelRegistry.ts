/** Shared metadata key used to attach persisted runtime-type information to decorated classes. */
export const persistedRuntimeTypeMetadataKey = Symbol.for("codemation.core.persistedRuntimeTypeMetadata");

export type DecoratedRuntimeType = Readonly<{ name?: string }> & object;

/** Categories of runtime classes that can be discovered and rehydrated from persisted snapshots. */
export type PersistedRuntimeTypeKind = "node" | "tool" | "chatModel";

export interface PersistedRuntimeTypeDecoratorOptions {
  readonly name?: string;
  readonly packageName?: string;
  readonly moduleUrl?: string;
}

/** Serialized metadata attached to a decorated runtime type. */
export interface PersistedRuntimeTypeMetadata {
  readonly persistedName: string;
  readonly kind: PersistedRuntimeTypeKind;
  readonly packageName: string;
  readonly sourceHint?: string;
}

/** Normalizes decorator options so persistence metadata has stable defaults. */
export class PersistedRuntimeTypeDecoratorDefaults {
  static readonly appPackageName = "app";

  static apply(options: PersistedRuntimeTypeDecoratorOptions): PersistedRuntimeTypeDecoratorOptions {
    return {
      ...options,
      packageName: options.packageName ?? this.appPackageName,
    };
  }
}
