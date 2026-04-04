// @vitest-environment node

import { hash } from "bcryptjs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import type { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

const authSecret = "codemation-auth-http-test-secret-minimum-32";

class AuthHttpFixture {
  static createLocalAuthConfig(): CodemationConfig {
    return {
      workflows: [],
      runtime: {
        eventBus: { kind: "memory" as const },
        scheduler: { kind: "local" as const },
      },
      auth: { kind: "local" as const },
    };
  }

  static createOAuthAuthConfig(): CodemationConfig {
    return {
      workflows: [],
      runtime: {
        eventBus: { kind: "memory" as const },
        scheduler: { kind: "local" as const },
      },
      auth: {
        kind: "oauth" as const,
        oauth: [
          {
            provider: "google" as const,
            clientIdEnv: "GOOGLE_CLIENT_ID",
            clientSecretEnv: "GOOGLE_CLIENT_SECRET",
          },
        ],
      },
    };
  }

  static async createHarness(
    database: IntegrationDatabase,
    transaction: PostgresRollbackTransaction,
  ): Promise<FrontendHttpIntegrationHarness> {
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(this.createLocalAuthConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        AUTH_SECRET: authSecret,
      },
      register: (context) => {
        context.registerFactory(ApplicationTokens.PrismaClient, () => transaction.getPrismaClient());
      },
    });
    await harness.start();
    return harness;
  }

  static async createOAuthHarness(
    database: IntegrationDatabase,
    transaction: PostgresRollbackTransaction,
  ): Promise<FrontendHttpIntegrationHarness> {
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(this.createOAuthAuthConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../../.."),
      env: {
        AUTH_SECRET: authSecret,
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
      },
      register: (context) => {
        context.registerFactory(ApplicationTokens.PrismaClient, () => transaction.getPrismaClient());
      },
    });
    await harness.start();
    return harness;
  }
}

class CookieHeaderParser {
  extractCookiePair(setCookieHeader: string): string {
    return setCookieHeader.split(";")[0] ?? "";
  }

  extractCookieValue(setCookieHeader: string, cookieName: string): string {
    const pair = this.extractCookiePair(setCookieHeader);
    const prefix = `${cookieName}=`;
    if (!pair.startsWith(prefix)) {
      throw new Error(`Expected cookie ${cookieName} in header: ${setCookieHeader}`);
    }
    return decodeURIComponent(pair.slice(prefix.length));
  }

  requireHeaderString(value: string | string[] | number | undefined): string {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    throw new Error(`Expected string header value, received ${String(value)}`);
  }
}

describe("auth http integration", () => {
  const session = new IntegrationTestDatabaseSession();
  const cookieHeaderParser = new CookieHeaderParser();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  it("issues a CSRF cookie, logs in, exposes the session principal, and removes access again on logout", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "Admin",
        accountStatus: "active",
        passwordHash: await hash("password-123", 12),
      },
    });

    const anonymousSession = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    expect(anonymousSession.statusCode).toBe(200);
    expect(anonymousSession.json<unknown>()).toBeNull();
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(anonymousSession.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "admin@example.com",
        password: "password-123",
      }),
    });
    expect(login.statusCode).toBe(204);
    const sessionCookieHeader = cookieHeaderParser.requireHeaderString(login.header("set-cookie"));
    const combinedCookieHeader = `${csrfCookiePair}; ${cookieHeaderParser.extractCookiePair(sessionCookieHeader)}`;

    const authenticatedSession = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
      headers: {
        cookie: combinedCookieHeader,
      },
    });
    expect(authenticatedSession.statusCode).toBe(200);
    expect(authenticatedSession.json<{ email: string }>()).toMatchObject({
      email: "admin@example.com",
    });

    const protectedUsers = await harness.request({
      method: "GET",
      url: ApiPaths.users(),
      headers: {
        cookie: combinedCookieHeader,
      },
    });
    expect(protectedUsers.statusCode).toBe(200);

    const logout = await harness.request({
      method: "POST",
      url: ApiPaths.authLogout(),
      headers: {
        cookie: combinedCookieHeader,
        "x-codemation-csrf-token": csrfToken,
      },
    });
    expect(logout.statusCode).toBe(204);
    const clearedSessionHeader = cookieHeaderParser.requireHeaderString(logout.header("set-cookie"));
    const cookieAfterLogout = `${csrfCookiePair}; ${cookieHeaderParser.extractCookiePair(clearedSessionHeader)}`;

    const protectedAfterLogout = await harness.request({
      method: "GET",
      url: ApiPaths.users(),
      headers: {
        cookie: cookieAfterLogout,
      },
    });
    expect(protectedAfterLogout.statusCode).toBe(401);
    await harness.close();
  });

  it("rejects login when the CSRF header does not match the issued cookie", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));

    const rejected = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: cookieHeaderParser.extractCookiePair(csrfCookieHeader),
        "content-type": "application/json",
        "x-codemation-csrf-token": "wrong-token",
      },
      payload: JSON.stringify({
        email: "admin@example.com",
        password: "password-123",
      }),
    });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json<{ error: string }>()).toMatchObject({
      error: "Invalid CSRF token.",
    });
    await harness.close();
  });

  it("starts OAuth providers from the backend auth route surface", async () => {
    const harness = await AuthHttpFixture.createOAuthHarness(session.database!, session.transaction!);

    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.authOAuthStart("google")}?callbackUrl=%2F`,
    });

    expect(response.statusCode).toBe(302);
    expect(response.header("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(response.header("set-cookie")).toBeDefined();
    await harness.close();
  });
});
