import { injectable } from "./di";

import { PersistedRuntimeTypeMetadataStore } from "./PersistedRuntimeTypeMetadataStoreRegistry";
import type { DecoratedRuntimeType, PersistedRuntimeTypeDecoratorOptions, PersistedRuntimeTypeKind } from "./persistedRuntimeTypeModelRegistry";

export class InjectableRuntimeDecoratorComposer {
  static compose(kind: PersistedRuntimeTypeKind, options: PersistedRuntimeTypeDecoratorOptions, decoratorFileUrl: string): ClassDecorator {
    return (target) => {
      injectable()(target as never);
      PersistedRuntimeTypeMetadataStore.define(target as DecoratedRuntimeType, kind, options, decoratorFileUrl);
    };
  }
}
