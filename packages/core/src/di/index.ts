import "reflect-metadata";

export { CoreTokens } from "./CoreTokens";
export {
  container,
  delay,
  inject,
  injectAll,
  injectable,
  instanceCachingFactory,
  instancePerContainerCachingFactory,
  predicateAwareClassFactory,
  registry,
  singleton,
} from "tsyringe";
export type {
  DependencyContainer as Container,
  DependencyContainer,
  Disposable,
  InjectionToken,
  Lifecycle,
  RegistrationOptions,
  InjectionToken as TypeToken,
} from "tsyringe";
