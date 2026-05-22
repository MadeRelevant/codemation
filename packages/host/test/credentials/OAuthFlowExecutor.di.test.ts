import "reflect-metadata";

import { container } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { ApplicationTokens } from "../../src/applicationTokens";
import { LocalOAuthFlowExecutor } from "../../src/credentials/LocalOAuthFlowExecutor";
import { CredentialMaterialResolver } from "../../src/domain/credentials/CredentialMaterialResolver";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialTypeRegistryImpl";
import { OAuth2ProviderRegistry } from "../../src/domain/credentials/OAuth2ProviderRegistry";
import { instanceCachingFactory } from "@codemation/core";

describe("ApplicationTokens.OAuthFlowExecutor (DI)", () => {
  it("resolves to a LocalOAuthFlowExecutor instance", () => {
    const child = container.createChildContainer();

    child.register(CredentialTypeRegistryImpl, {
      useFactory: instanceCachingFactory(() => new CredentialTypeRegistryImpl()),
    });
    child.registerInstance(ApplicationTokens.CredentialStore, {} as never);
    child.registerSingleton(CredentialMaterialResolver, CredentialMaterialResolver);
    child.registerInstance(ApplicationTokens.AppConfig, { env: {} } as never);
    child.registerSingleton(OAuth2ProviderRegistry, OAuth2ProviderRegistry);
    child.registerInstance(ApplicationTokens.Clock, { now: () => new Date() } as never);
    child.registerSingleton(LocalOAuthFlowExecutor, LocalOAuthFlowExecutor);
    child.register(ApplicationTokens.OAuthFlowExecutor, {
      useFactory: instanceCachingFactory((c) => c.resolve(LocalOAuthFlowExecutor)),
    });

    const executor = child.resolve(ApplicationTokens.OAuthFlowExecutor);
    expect(executor).toBeInstanceOf(LocalOAuthFlowExecutor);
  });
});
