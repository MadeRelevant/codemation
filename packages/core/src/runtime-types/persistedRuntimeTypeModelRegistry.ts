export const persistedRuntimeTypeMetadataKey = Symbol.for("codemation.core.persistedRuntimeTypeMetadata");

export type DecoratedRuntimeType = Readonly<{ name?: string }> & object;

export type PersistedRuntimeTypeKind = "node" | "tool" | "chatModel";

export interface PersistedRuntimeTypeDecoratorOptions {
  readonly name?: string;
  readonly packageName?: string;
  readonly moduleUrl?: string;
}

export interface PersistedRuntimeTypeMetadata {
  readonly persistedName: string;
  readonly kind: PersistedRuntimeTypeKind;
  readonly packageName: string;
  readonly sourceHint?: string;
}

export class PersistedRuntimeTypeDecoratorDefaults {
  static readonly appPackageName = "app";

  static apply(options: PersistedRuntimeTypeDecoratorOptions): PersistedRuntimeTypeDecoratorOptions {
    return {
      ...options,
      packageName: options.packageName ?? this.appPackageName,
    };
  }
}

