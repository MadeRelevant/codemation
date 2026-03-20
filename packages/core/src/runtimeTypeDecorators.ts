import type { PersistedRuntimeTypeDecoratorOptions,PersistedRuntimeTypeMetadata } from "./persistedRuntimeTypeModel";

import { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposer";
import { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStore";

export type {
PersistedRuntimeTypeDecoratorOptions,PersistedRuntimeTypeKind,PersistedRuntimeTypeMetadata
} from "./persistedRuntimeTypeModel";

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

export { InjectableRuntimeDecoratorComposer } from "./InjectableRuntimeDecoratorComposer";
export { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStore";
export { PersistedRuntimeTypeNameResolver } from "./PersistedRuntimeTypeNameResolver";
export { StackTraceCallSitePathResolver } from "./StackTraceCallSitePathResolver";
