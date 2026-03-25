import type {
  PersistedRuntimeTypeDecoratorOptions,
  PersistedRuntimeTypeMetadata,
} from "./persistedRuntimeTypeModelRegistry";

import { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposerRegistry";
import { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";

export type {
  PersistedRuntimeTypeDecoratorOptions,
  PersistedRuntimeTypeKind,
  PersistedRuntimeTypeMetadata,
} from "./persistedRuntimeTypeModelRegistry";

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

export { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposerRegistry";
export { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";
export { PersistedRuntimeTypeNameResolver } from "./PersistedRuntimeTypeNameResolver";
export { StackTraceCallSitePathResolver } from "./StackTraceCallSitePathResolver";
