import { injectable } from "./di";
const persistedRuntimeTypeMetadataKey = Symbol.for("codemation.core.persistedRuntimeTypeMetadata");

type DecoratedRuntimeType = Readonly<{ name?: string }> & object;

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

class PersistedRuntimeTypeDecoratorDefaults {
  static readonly appPackageName = "app";

  static apply(options: PersistedRuntimeTypeDecoratorOptions): PersistedRuntimeTypeDecoratorOptions {
    return {
      ...options,
      packageName: options.packageName ?? this.appPackageName,
    };
  }
}

class PersistedRuntimeTypeNameResolver {
  static resolve(target: DecoratedRuntimeType, override: string | undefined): string {
    const resolved = override ?? target.name;
    if (!resolved) {
      throw new Error("Persisted runtime token metadata requires a named class or an explicit decorator name override.");
    }
    return resolved;
  }
}

class StackTraceCallSitePathResolver {
  static resolve(decoratorFileUrl: string): string | undefined {
    const stack = new Error().stack ?? "";
    for (const line of stack.split("\n")) {
      const candidate = this.extractPath(line.trim());
      if (!candidate) {
        continue;
      }
      if (candidate === decoratorFileUrl || candidate.includes("runtimeTypeDecorators")) {
        continue;
      }
      return candidate;
    }
    return undefined;
  }

  private static extractPath(line: string): string | undefined {
    const fileUrlMatch = line.match(/file:\/\/[^\s)]+/);
    if (fileUrlMatch) return fileUrlMatch[0];
    const parenMatch = line.match(/\((\/[^)]+)\)/);
    if (parenMatch) return parenMatch[1];
    const bareMatch = line.match(/at (\/[^\s]+)/);
    return bareMatch?.[1];
  }
}

class PersistedRuntimeTypeMetadataStore {
  static define(target: DecoratedRuntimeType, kind: PersistedRuntimeTypeKind, options: PersistedRuntimeTypeDecoratorOptions, decoratorFileUrl: string): void {
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
    return (target as Record<PropertyKey, unknown>)[persistedRuntimeTypeMetadataKey] as PersistedRuntimeTypeMetadata | undefined;
  }
}

class InjectableRuntimeDecoratorComposer {
  static compose(kind: PersistedRuntimeTypeKind, options: PersistedRuntimeTypeDecoratorOptions, decoratorFileUrl: string): ClassDecorator {
    return (target) => {
      injectable()(target as never);
      PersistedRuntimeTypeMetadataStore.define(target as DecoratedRuntimeType, kind, options, decoratorFileUrl);
    };
  }
}

export function getPersistedRuntimeTypeMetadata(target: unknown): PersistedRuntimeTypeMetadata | undefined {
  return PersistedRuntimeTypeMetadataStore.get(target);
}

export function node(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("node", options, import.meta.url);
}

export function tool(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("tool", options, import.meta.url);
}

export function chatModel(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("chatModel", options, import.meta.url);
}
