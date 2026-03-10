import type { Container } from "@codemation/core";

type ConstructableClass = new (...args: unknown[]) => object;
type ConsumerInjectionToken = Parameters<Container["resolve"]>[0];

type InjectionTokenDescriptor = Readonly<{
  token?: unknown;
  multiple?: boolean;
  isOptional?: boolean;
  transform?: unknown;
  transformArgs?: ReadonlyArray<unknown>;
}>;

export class CodemationConsumerClassRegistrar {
  registerModuleExports(args: Readonly<{ container: Container; moduleExports: Readonly<Record<string, unknown>> }>): void {
    for (const exportedValue of Object.values(args.moduleExports)) {
      if (!this.isConstructableClass(exportedValue)) continue;
      if (args.container.isRegistered(exportedValue, true)) continue;
      args.container.register(exportedValue, {
        useFactory: (dependencyContainer) => this.construct(dependencyContainer, exportedValue),
      });
    }
  }

  private construct(container: Container, target: ConstructableClass): object {
    return new target(...this.resolveConstructorArguments(container, target));
  }

  private resolveConstructorArguments(container: Container, target: ConstructableClass): ReadonlyArray<unknown> {
    const parameterTypes = this.readParameterTypes(target);
    const maxParameterIndex = parameterTypes.length - 1;
    if (maxParameterIndex < 0) return [];
    const argumentsToInject: unknown[] = [];
    for (let index = 0; index <= maxParameterIndex; index++) {
      const parameterType = parameterTypes[index];
      if (parameterType === undefined) {
        throw new Error(`TypeInfo not known for "${target.name || "<anonymous class>"}"`);
      }
      argumentsToInject.push(this.resolveDependency(container, parameterType));
    }
    return argumentsToInject;
  }

  private readParameterTypes(target: ConstructableClass): ReadonlyArray<unknown> {
    const reflectedParameterTypes = (Reflect.getMetadata("design:paramtypes", target) as ReadonlyArray<unknown> | undefined) ?? [];
    const injectionTokens = (Reflect.getOwnMetadata("injectionTokens", target) as Readonly<Record<number, unknown>> | undefined) ?? {};
    const mergedParameterTypes = [...reflectedParameterTypes];
    for (const [parameterIndex, injectionToken] of Object.entries(injectionTokens)) {
      mergedParameterTypes[Number(parameterIndex)] = injectionToken;
    }
    return mergedParameterTypes;
  }

  private resolveDependency(container: Container, parameterType: unknown): unknown {
    if (!this.isInjectionTokenDescriptor(parameterType)) {
      return container.resolve(parameterType as ConsumerInjectionToken);
    }
    if (parameterType.transform) {
      throw new Error("Consumer DI auto-registration does not support transform-based injection metadata.");
    }
    if (parameterType.multiple) {
      return container.resolveAll(parameterType.token as ConsumerInjectionToken);
    }
    if (parameterType.isOptional && !container.isRegistered(parameterType.token as ConsumerInjectionToken, true)) {
      return undefined;
    }
    return container.resolve(parameterType.token as ConsumerInjectionToken);
  }

  private isConstructableClass(value: unknown): value is ConstructableClass {
    return typeof value === "function" && Boolean(value.prototype) && value.prototype.constructor === value;
  }

  private isInjectionTokenDescriptor(value: unknown): value is InjectionTokenDescriptor {
    return typeof value === "object" && value !== null && "token" in value;
  }
}
