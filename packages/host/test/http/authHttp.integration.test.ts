// @vitest-environment node

import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { UserAccountService } from "../../src/domain/users/UserAccountServiceRegistry";
import { UserAccountSessionPolicy } from "../../src/domain/users/UserAccountSessionPolicy";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import type { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

const authSecret = "codemation-auth-http-test-secret-minimum-32";

/** Better Auth origin validation when the browser already holds Codemation CSRF cookies. */
const testTrustedOrigin = "http://127.0.0.1";

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
        CODEMATION_PUBLIC_BASE_URL: testTrustedOrigin,
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
        CODEMATION_PUBLIC_BASE_URL: testTrustedOrigin,
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
    const adminHash = await hash("password-123", 12);
    const admin = await prisma.user.create({
      data: {
        email: "admin@example.com",
        name: "Admin",
        accountStatus: "active",
        passwordHash: adminHash,
      },
    });
    await prisma.account.create({
      data: {
        userId: admin.id,
        provider: "credential",
        providerAccountId: admin.id,
        password: adminHash,
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
        origin: testTrustedOrigin,
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
        origin: testTrustedOrigin,
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
        origin: testTrustedOrigin,
      },
    });
    expect(protectedUsers.statusCode).toBe(200);

    const logout = await harness.request({
      method: "POST",
      url: ApiPaths.authLogout(),
      headers: {
        cookie: combinedCookieHeader,
        origin: testTrustedOrigin,
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
        origin: testTrustedOrigin,
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
        origin: testTrustedOrigin,
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

  it("lets a bootstrap-upserted local user sign in through Better Auth cookies", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    const localConfig = AuthHttpFixture.createLocalAuthConfig();
    const userAccounts = new UserAccountService(
      localConfig.auth ?? { kind: "local" },
      prisma,
      new UserAccountSessionPolicy(),
    );
    await userAccounts.upsertBootstrapLocalUser("bootstrap@example.com", "password-456");

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: testTrustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "bootstrap@example.com",
        password: "password-456",
      }),
    });
    expect(login.statusCode).toBe(204);

    const sessionCookieHeader = cookieHeaderParser.requireHeaderString(login.header("set-cookie"));
    const combined = `${csrfCookiePair}; ${cookieHeaderParser.extractCookiePair(sessionCookieHeader)}`;
    const me = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
      headers: { cookie: combined, origin: testTrustedOrigin },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ email: string }>()).toMatchObject({ email: "bootstrap@example.com" });

    const row = await prisma.account.findFirst({
      where: { user: { email: "bootstrap@example.com" }, provider: "credential" },
    });
    expect(row?.password).toBeTruthy();
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

  it("does not issue a Better Auth session for invited users even when credential rows exist", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    const passwordHash = await hash("password-123", 12);
    const invited = await prisma.user.create({
      data: {
        email: "invited-only@example.com",
        name: "Invited",
        accountStatus: "invited",
        passwordHash,
      },
    });
    await prisma.account.create({
      data: {
        userId: invited.id,
        provider: "credential",
        providerAccountId: invited.id,
        password: passwordHash,
      },
    });

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: testTrustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "invited-only@example.com",
        password: "password-123",
      }),
    });
    expect(login.statusCode).not.toBe(204);
    await harness.close();
  });

  it("does not issue a Better Auth session for inactive users", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    const passwordHash = await hash("inactive-pw-1", 12);
    const inactive = await prisma.user.create({
      data: {
        email: "inactive@example.com",
        name: "Inactive",
        accountStatus: "inactive",
        passwordHash,
      },
    });
    await prisma.account.create({
      data: {
        userId: inactive.id,
        provider: "credential",
        providerAccountId: inactive.id,
        password: passwordHash,
      },
    });

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: testTrustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "inactive@example.com",
        password: "inactive-pw-1",
      }),
    });
    expect(login.statusCode).not.toBe(204);
    await harness.close();
  });

  it("drops the API principal after accountStatus becomes inactive (stale cookie)", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    const passwordHash = await hash("active-then-cut", 12);
    const user = await prisma.user.create({
      data: {
        email: "active-then-cut@example.com",
        name: "A",
        accountStatus: "active",
        passwordHash,
      },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        provider: "credential",
        providerAccountId: user.id,
        password: passwordHash,
      },
    });

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: testTrustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "active-then-cut@example.com",
        password: "active-then-cut",
      }),
    });
    expect(login.statusCode).toBe(204);
    const sessionCookieHeader = cookieHeaderParser.requireHeaderString(login.header("set-cookie"));
    const combined = `${csrfCookiePair}; ${cookieHeaderParser.extractCookiePair(sessionCookieHeader)}`;

    const whileActive = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
      headers: { cookie: combined, origin: testTrustedOrigin },
    });
    expect(whileActive.statusCode).toBe(200);
    expect(whileActive.json<{ email: string } | null>()).toMatchObject({
      email: "active-then-cut@example.com",
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { accountStatus: "inactive" },
    });

    const afterInactive = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
      headers: { cookie: combined, origin: testTrustedOrigin },
    });
    expect(afterInactive.statusCode).toBe(200);
    expect(afterInactive.json<unknown>()).toBeNull();

    await harness.close();
  });

  it("lets a user sign in via Better Auth after invite acceptance activates the directory row", async () => {
    const harness = await AuthHttpFixture.createHarness(session.database!, session.transaction!);
    const prisma = session.transaction!.getPrismaClient();
    const rawToken = "integration-invite-raw-token";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const now = new Date("2026-04-04T12:00:00.000Z");
    const expiresAt = new Date("2099-01-01T00:00:00.000Z");
    const u = await prisma.user.create({
      data: {
        email: "post-invite-login@example.com",
        name: "PostInvite",
        accountStatus: "invited",
      },
    });
    await prisma.userInvite.create({
      data: { userId: u.id, tokenHash, expiresAt, createdAt: now },
    });

    const accept = await harness.request({
      method: "POST",
      url: ApiPaths.userInviteAccept(),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: rawToken, password: "longpassword123" }),
    });
    expect(accept.statusCode).toBe(204);

    const readBack = await prisma.user.findUnique({ where: { id: u.id } });
    expect(readBack?.accountStatus).toBe("active");
    expect(readBack?.passwordHash).toBeTruthy();

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");

    const login = await harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: testTrustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: "post-invite-login@example.com",
        password: "longpassword123",
      }),
    });
    expect(login.statusCode).toBe(204);

    const sessionCookieHeader = cookieHeaderParser.requireHeaderString(login.header("set-cookie"));
    const combined = `${csrfCookiePair}; ${cookieHeaderParser.extractCookiePair(sessionCookieHeader)}`;
    const me = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
      headers: { cookie: combined, origin: testTrustedOrigin },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json<{ email: string }>()).toMatchObject({ email: "post-invite-login@example.com" });

    await harness.close();
  });
});
