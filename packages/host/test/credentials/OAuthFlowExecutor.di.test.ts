import "reflect-metadata";

import { container } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { ApplicationTokens } from "../../src/applicationTokens";
import { LocalOAuthFlowExecutor } from "../../src/credentials/LocalOAuthFlowExecutor";
import { ManagedOAuthFlowExecutor } from "../../src/credentials/ManagedOAuthFlowExecutor";
import { CredentialMaterialResolver } from "../../src/domain/credentials/CredentialMaterialResolver";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialTypeRegistryImpl";
import { OAuth2ProviderRegistry } from "../../src/domain/credentials/OAuth2ProviderRegistry";
import { PairedFetch } from "../../src/pairing/PairedFetch";
import { PairingConfigToken } from "../../src/pairing/PairingConfigToken";
import { instanceCachingFactory } from "@codemation/core";

const fakePairingConfig = {
  workspaceId: "ws-1",
  pairingSecret: "secret",
  controlPlaneUrl: "https://cp.example.com",
};

const fakeLoggerFactory = {
  create: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
  createPerformanceDiagnostics: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
};

describe("ApplicationTokens.OAuthFlowExecutor (DI)", () => {
  it("resolves to a LocalOAuthFlowExecutor when pairing is not configured", () => {
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

  it("resolves to a ManagedOAuthFlowExecutor when pairing is configured", () => {
    const child = container.createChildContainer();

    child.registerInstance(PairingConfigToken, fakePairingConfig);
    child.registerInstance(PairedFetch, { post: async () => ({}) } as never);
    child.registerInstance(ApplicationTokens.LoggerFactory, fakeLoggerFactory as never);
    child.registerSingleton(ManagedOAuthFlowExecutor, ManagedOAuthFlowExecutor);
    child.register(ApplicationTokens.OAuthFlowExecutor, {
      useFactory: instanceCachingFactory((c) => c.resolve(ManagedOAuthFlowExecutor)),
    });

    const executor = child.resolve(ApplicationTokens.OAuthFlowExecutor);
    expect(executor).toBeInstanceOf(ManagedOAuthFlowExecutor);
  });
});
