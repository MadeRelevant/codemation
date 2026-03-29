import type { Container } from "@codemation/core";
import type {
  CodemationClassRegistration,
  CodemationContainerRegistration,
  CodemationValueRegistration,
} from "./CodemationContainerRegistration";

export class CodemationContainerRegistrationRegistrar {
  apply(container: Container, registrations: ReadonlyArray<CodemationContainerRegistration<unknown>>): void {
    for (const registration of registrations) {
      this.applyRegistration(container, registration);
    }
  }

  private applyRegistration(container: Container, registration: CodemationContainerRegistration<unknown>): void {
    if (this.isValueRegistration(registration)) {
      container.registerInstance(registration.token, registration.useValue);
      return;
    }
    if (this.isClassRegistration(registration)) {
      container.register(registration.token, {
        useClass: registration.useClass as never,
      });
      return;
    }
    container.register(registration.token, {
      useFactory: (dependencyContainer) => registration.useFactory(dependencyContainer),
    });
  }

  private isValueRegistration(
    registration: CodemationContainerRegistration<unknown>,
  ): registration is CodemationValueRegistration<unknown> {
    return "useValue" in registration;
  }

  private isClassRegistration(
    registration: CodemationContainerRegistration<unknown>,
  ): registration is CodemationClassRegistration<unknown> {
    return "useClass" in registration;
  }
}
