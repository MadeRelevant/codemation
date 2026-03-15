import type { Container, TypeToken } from "@codemation/core";

export type CodemationClassToken<TValue> = new (...args: never[]) => TValue;

export interface CodemationBindingBase<TValue> {
  readonly token: TypeToken<TValue>;
}

export interface CodemationValueBinding<TValue> extends CodemationBindingBase<TValue> {
  readonly useValue: TValue;
}

export interface CodemationClassBinding<TValue> extends CodemationBindingBase<TValue> {
  readonly useClass: CodemationClassToken<TValue>;
}

export interface CodemationFactoryBinding<TValue> extends CodemationBindingBase<TValue> {
  readonly useFactory: (container: Container) => TValue;
}

export type CodemationBinding<TValue = unknown> =
  | CodemationValueBinding<TValue>
  | CodemationClassBinding<TValue>
  | CodemationFactoryBinding<TValue>;
