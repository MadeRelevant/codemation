import { injectable } from "../di";

import { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";
import type {
  DecoratedRuntimeType,
  PersistedRuntimeTypeDecoratorOptions,
  PersistedRuntimeTypeKind,
} from "./persistedRuntimeTypeModelRegistry";

/**
 * Applies both tsyringe injectability and persisted runtime metadata in one decorator.
 * This keeps runtime-type decorators thin while still recording enough data for snapshot hydration.
 */
export class InjectableRuntimeDecoratorComposer {
  static compose(
    kind: PersistedRuntimeTypeKind,
    options: PersistedRuntimeTypeDecoratorOptions,
    decoratorFileUrl: string,
  ): ClassDecorator {
    return (target) => {
      injectable()(target as never);
      PersistedRuntimeTypeMetadataStore.define(target as DecoratedRuntimeType, kind, options, decoratorFileUrl);
    };
  }
}
