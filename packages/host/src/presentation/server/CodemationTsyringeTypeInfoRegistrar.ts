import type { Container, TypeToken, WorkflowDefinition } from "@codemation/core";

import { CodemationTsyringeParamInfoReader } from "./CodemationTsyringeParamInfoReader";

type InjectionDescriptor = Readonly<{
  token?: unknown;
}>;

export class CodemationTsyringeTypeInfoRegistrar {
  private readonly visitedTokens = new Set<unknown>();
  private readonly visitedConfigObjects = new Set<object>();

  constructor(private readonly container: Container) {}

  registerWorkflowDefinitions(workflows: ReadonlyArray<WorkflowDefinition>): void {
    for (const workflow of workflows) {
      for (const node of workflow.nodes) {
        this.registerTypeToken(node.type);
        this.registerConfigTokens(node.config);
      }
    }
  }

  registerTypeToken(token: unknown): void {
    if (typeof token !== "function" || this.visitedTokens.has(token)) {
      return;
    }
    this.visitedTokens.add(token);
    const paramInfo = CodemationTsyringeParamInfoReader.read(token);
    for (const dependency of paramInfo) {
      this.registerDependency(dependency);
    }
    this.registerFactoryProvider(token as new (...args: ReadonlyArray<unknown>) => unknown, paramInfo);
  }

  private registerDependency(dependency: unknown): void {
    const token = this.resolveDependencyToken(dependency);
    if (typeof token !== "function") {
      return;
    }
    if (!this.container.isRegistered(token as TypeToken<unknown>, true)) {
      return;
    }
    this.registerTypeToken(token);
  }

  private registerConfigTokens(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach((entry: unknown) => this.registerConfigTokens(entry));
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    if (this.visitedConfigObjects.has(value)) {
      return;
    }
    this.visitedConfigObjects.add(value);
    if ("type" in value && typeof value.type === "function") {
      this.registerTypeToken(value.type);
    }
    Object.values(value).forEach((entry: unknown) => this.registerConfigTokens(entry));
  }

  private registerFactoryProvider(
    token: new (...args: ReadonlyArray<unknown>) => unknown,
    paramInfo: ReadonlyArray<unknown>,
  ): void {
    if (this.container.isRegistered(token as TypeToken<unknown>, true)) {
      return;
    }
    const classToken = token as unknown as TypeToken<unknown>;
    const constructorToken = token as unknown as new (...args: ReadonlyArray<unknown>) => unknown;
    this.container.register(classToken, {
      useFactory: (dependencyContainer) => {
        const dependencies = paramInfo.map((dependency: unknown) =>
          this.resolveFactoryDependency(dependencyContainer, dependency),
        );
        return new constructorToken(...dependencies);
      },
    });
  }

  private resolveDependencyToken(dependency: unknown): unknown {
    if (this.isInjectionDescriptor(dependency)) {
      return dependency.token;
    }
    return dependency;
  }

  private resolveFactoryDependency(dependencyContainer: Container, dependency: unknown): unknown {
    const token = this.resolveDependencyToken(dependency);
    if (typeof token === "function") {
      if (dependencyContainer.isRegistered(token as TypeToken<unknown>, true)) {
        try {
          return dependencyContainer.resolve(token as TypeToken<unknown>);
        } catch (error) {
          if (!this.isMissingTypeInfoError(error)) {
            throw error;
          }
        }
      }
      this.registerTypeToken(token);
      const constructorToken = token as unknown as new (...args: ReadonlyArray<unknown>) => unknown;
      const paramInfo = CodemationTsyringeParamInfoReader.read(token);
      const nestedDependencies = paramInfo.map((entry: unknown) =>
        this.resolveFactoryDependency(dependencyContainer, entry),
      );
      return new constructorToken(...nestedDependencies);
    }
    return dependencyContainer.resolve(token as TypeToken<unknown>);
  }

  private isInjectionDescriptor(value: unknown): value is InjectionDescriptor {
    return value !== null && typeof value === "object" && "token" in value;
  }

  private isMissingTypeInfoError(error: unknown): boolean {
    return error instanceof Error && error.message.includes("TypeInfo not known for");
  }
}
