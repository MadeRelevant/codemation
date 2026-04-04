import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationBetterAuthDatabaseOptionsFactory } from "../../src/infrastructure/auth/CodemationBetterAuthDatabaseOptionsFactory";
import type { PrismaDatabaseClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";

class CodemationBetterAuthDatabaseOptionsFactoryFixture {
  private readonly factory = new CodemationBetterAuthDatabaseOptionsFactory();

  createSubject(): CodemationBetterAuthDatabaseOptionsFactory {
    return this.factory;
  }
}

test("CodemationBetterAuthDatabaseOptionsFactory maps Prisma Auth.js field names for session, account, verification", () => {
  const subject = new CodemationBetterAuthDatabaseOptionsFactoryFixture().createSubject();
  const options = subject.buildDatabaseModelOptions();

  assert.deepEqual(options.session?.fields, {
    token: "sessionToken",
    expiresAt: "expires",
  });

  assert.deepEqual(options.account?.fields, {
    accountId: "providerAccountId",
    providerId: "provider",
    accessToken: "access_token",
    refreshToken: "refresh_token",
    idToken: "id_token",
    scope: "scope",
    accessTokenExpiresAt: "accessTokenExpiresAt",
    refreshTokenExpiresAt: "refreshTokenExpiresAt",
  });

  assert.equal(options.verification?.modelName, "verificationToken");
  assert.deepEqual(options.verification?.fields, {
    value: "token",
    expiresAt: "expires",
  });
});

test("CodemationBetterAuthDatabaseOptionsFactory preserves Codemation user semantics via additionalFields", () => {
  const subject = new CodemationBetterAuthDatabaseOptionsFactoryFixture().createSubject();
  const options = subject.buildDatabaseModelOptions();

  assert.equal(options.user?.additionalFields?.accountStatus?.type, "string");
  assert.equal(options.user?.additionalFields?.accountStatus?.required, true);
  assert.equal(options.user?.additionalFields?.accountStatus?.defaultValue, "active");
  assert.equal(options.user?.additionalFields?.accountStatus?.fieldName, "accountStatus");

  assert.equal(options.user?.additionalFields?.passwordHash?.type, "string");
  assert.equal(options.user?.additionalFields?.passwordHash?.required, false);
  assert.equal(options.user?.additionalFields?.passwordHash?.input, false);
  assert.equal(options.user?.additionalFields?.passwordHash?.returned, false);
  assert.equal(options.user?.additionalFields?.passwordHash?.fieldName, "passwordHash");
});

test("CodemationBetterAuthDatabaseOptionsFactory carries forward Auth.js-only account columns as additionalFields", () => {
  const subject = new CodemationBetterAuthDatabaseOptionsFactoryFixture().createSubject();
  const additional = subject.buildDatabaseModelOptions().account?.additionalFields;

  assert.equal(additional?.authJsAccountType?.fieldName, "type");
  assert.equal(additional?.authJsTokenType?.fieldName, "token_type");
  assert.equal(additional?.authJsSessionState?.fieldName, "session_state");
});

test("CodemationBetterAuthDatabaseOptionsFactory resolves prisma adapter provider from CODEMATION_PRISMA_PROVIDER", () => {
  const subject = new CodemationBetterAuthDatabaseOptionsFactoryFixture().createSubject();

  assert.equal(subject.resolvePrismaProviderForAdapter({}), "postgresql");
  assert.equal(subject.resolvePrismaProviderForAdapter({ CODEMATION_PRISMA_PROVIDER: "postgresql" }), "postgresql");
  assert.equal(subject.resolvePrismaProviderForAdapter({ CODEMATION_PRISMA_PROVIDER: "sqlite" }), "sqlite");
  assert.equal(subject.buildPrismaAdapterConfig({}).provider, "postgresql");
  assert.equal(subject.buildPrismaAdapterConfig({ CODEMATION_PRISMA_PROVIDER: "sqlite" }).provider, "sqlite");
  assert.equal(subject.buildPrismaAdapterConfig({ CODEMATION_PRISMA_PROVIDER: "sqlite" }).transaction, false);
});

test("CodemationBetterAuthDatabaseOptionsFactory exposes prismaAdapter binding for later betterAuth() wiring", () => {
  const subject = new CodemationBetterAuthDatabaseOptionsFactoryFixture().createSubject();
  const binding = subject.createPrismaAdapterFactory({} as PrismaDatabaseClient, {});
  assert.equal(typeof binding, "function");
});
