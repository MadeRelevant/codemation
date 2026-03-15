import { instanceCachingFactory, type Container } from "@codemation/core";
import type {
  CodemationBinding,
  CodemationClassBinding,
  CodemationValueBinding,
} from "../../presentation/config/CodemationBinding";

export class CodemationConfigBindingRegistrar {
  apply(container: Container, bindings: ReadonlyArray<CodemationBinding<unknown>>): void {
    for (const binding of bindings) {
      this.applyBinding(container, binding);
    }
  }

  private applyBinding(container: Container, binding: CodemationBinding<unknown>): void {
    if (this.isValueBinding(binding)) {
      container.registerInstance(binding.token, binding.useValue);
      return;
    }
    if (this.isClassBinding(binding)) {
      container.register(binding.token, binding.useClass);
      return;
    }
    container.register(binding.token, {
      useFactory: instanceCachingFactory((dependencyContainer) => binding.useFactory(dependencyContainer)),
    });
  }

  private isValueBinding(binding: CodemationBinding<unknown>): binding is CodemationValueBinding<unknown> {
    return "useValue" in binding;
  }

  private isClassBinding(binding: CodemationBinding<unknown>): binding is CodemationClassBinding<unknown> {
    return "useClass" in binding;
  }
}
