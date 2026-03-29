import type { Container, TypeToken } from "@codemation/core";
import type { CodemationClassToken } from "../presentation/config/CodemationClassToken";

interface CodemationContainerRegistrationBase<TValue> {
  readonly token: TypeToken<TValue>;
}

export interface CodemationValueRegistration<TValue> extends CodemationContainerRegistrationBase<TValue> {
  readonly useValue: TValue;
}

export interface CodemationClassRegistration<TValue> extends CodemationContainerRegistrationBase<TValue> {
  readonly useClass: CodemationClassToken<TValue>;
}

export interface CodemationFactoryRegistration<TValue> extends CodemationContainerRegistrationBase<TValue> {
  readonly useFactory: (container: Container) => TValue;
}

export type CodemationContainerRegistration<TValue = unknown> =
  | CodemationValueRegistration<TValue>
  | CodemationClassRegistration<TValue>
  | CodemationFactoryRegistration<TValue>;
