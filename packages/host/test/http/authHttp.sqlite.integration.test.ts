// @vitest-environment node

/**
 * SQLite-specific regression: local password auth must work on the file-backed Prisma track
 * (same Better Auth + Codemation routes as Postgres integration tests).
 */

import { hash } from "bcryptjs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import type { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";
import { SqliteIntegrationDatabase } from "./testkit/SqliteIntegrationDatabase";

const authSecret = "codemation-auth-sqlite-http-test-secret-minimum-32-chars";
const testTrustedOrigin = "http://127.0.0.1";

class AuthSqliteHttpFixture {
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

  static async createHarness(
    database: SqliteIntegrationDatabase,
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

describe("auth http integration (sqlite)", () => {
  const cookieHeaderParser = new CookieHeaderParser();
  let database: SqliteIntegrationDatabase;
  let transaction: PostgresRollbackTransaction;

  beforeAll(async () => {
    database = await SqliteIntegrationDatabase.create();
    transaction = await database.beginRollbackTransaction();
  });

  afterEach(async () => {
    await transaction.rollback();
    transaction = await database.beginRollbackTransaction();
  });

  afterAll(async () => {
    await database.close();
  });

  it("issues session after password login on SQLite persistence", async () => {
    const harness = await AuthSqliteHttpFixture.createHarness(database, transaction);
    const prisma = transaction.getPrismaClient();
    const adminHash = await hash("sqlite-local-pw", 12);
    const admin = await prisma.user.create({
      data: {
        email: "sqlite-user@example.com",
        name: "Sqlite",
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

    const csrfProbe = await harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    expect(csrfProbe.statusCode).toBe(200);
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
        email: "sqlite-user@example.com",
        password: "sqlite-local-pw",
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
    expect(me.json<{ email: string }>()).toMatchObject({ email: "sqlite-user@example.com" });

    await harness.close();
  });
});
