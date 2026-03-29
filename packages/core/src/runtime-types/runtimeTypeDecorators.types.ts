import type {
  PersistedRuntimeTypeDecoratorOptions,
  PersistedRuntimeTypeMetadata,
} from "./persistedRuntimeTypeModelRegistry";

import { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposerRegistry";
import { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";

/**
 * Public decorator entry points for runtime-discoverable classes.
 *
 * These exports intentionally stay as plain decorator factory functions because TypeScript's
 * `@decorator()` syntax expects callable values rather than instance methods. The helpers below
 * attach DI metadata and persisted-name metadata in one step so hosts can discover nodes, tools,
 * and chat models without duplicating registration boilerplate.
 */
export type {
  PersistedRuntimeTypeDecoratorOptions,
  PersistedRuntimeTypeKind,
  PersistedRuntimeTypeMetadata,
} from "./persistedRuntimeTypeModelRegistry";

/** Reads persisted runtime metadata from a decorated class or object. */
export function getPersistedRuntimeTypeMetadata(target: unknown): PersistedRuntimeTypeMetadata | undefined {
  return PersistedRuntimeTypeMetadataStore.get(target);
}

/** Marks a class as a persisted node runtime type and an injectable tsyringe service. */
export function node(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("node", options, import.meta.url);
}

/** Marks a class as a persisted tool runtime type and an injectable tsyringe service. */
export function tool(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("tool", options, import.meta.url);
}

/** Marks a class as a persisted chat-model runtime type and an injectable tsyringe service. */
export function chatModel(options: PersistedRuntimeTypeDecoratorOptions = {}): ClassDecorator {
  return InjectableRuntimeDecoratorComposer.compose("chatModel", options, import.meta.url);
}

export { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposerRegistry";
export { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";
export { PersistedRuntimeTypeNameResolver } from "./PersistedRuntimeTypeNameResolver";
export { StackTraceCallSitePathResolver } from "./StackTraceCallSitePathResolver";
