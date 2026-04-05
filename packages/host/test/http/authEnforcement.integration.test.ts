// @vitest-environment node

import { hash } from "bcryptjs";
import type { WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger, MapData } from "@codemation/core-nodes";
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

class AuthEnforcementFixture {
  static readonly workflowId = "wf.http.auth";
  static readonly secret = "codemation-auth-test-secret-minimum-32-chars-long";
  static readonly trustedOrigin = "http://127.0.0.1";

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "Auth enforcement",
    })
      .trigger(new ManualTrigger("t", "trigger"))
      .then(new MapData("m", (item) => item.json, "map"))
      .build();
  }

  static createProtectedConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: { kind: "local" },
    };
  }

  static async createHarness(
    database: IntegrationDatabase,
    transaction: PostgresRollbackTransaction,
  ): Promise<FrontendHttpIntegrationHarness> {
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(this.createProtectedConfig(), database),
      consumerRoot: path.resolve(import.meta.dirname, "../.."),
      env: {
        AUTH_SECRET: this.secret,
        CODEMATION_PUBLIC_BASE_URL: this.trustedOrigin,
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

class LocalWorkflowSessionFactory {
  private static readonly email = "integration@codemation.test";
  private static readonly password = "integration-password-123";

  constructor(
    private readonly cookieHeaderParser: CookieHeaderParser,
    private readonly harness: FrontendHttpIntegrationHarness,
    private readonly transaction: PostgresRollbackTransaction,
  ) {}

  async createHeaders(): Promise<Readonly<Record<string, string>>> {
    const prisma = this.transaction.getPrismaClient();
    const passwordHash = await hash(LocalWorkflowSessionFactory.password, 12);
    const user = await prisma.user.create({
      data: {
        email: LocalWorkflowSessionFactory.email,
        name: "Integration",
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
    const csrfProbe = await this.harness.request({
      method: "GET",
      url: ApiPaths.authSession(),
    });
    const csrfCookieHeader = this.cookieHeaderParser.requireHeaderString(csrfProbe.header("set-cookie"));
    const csrfCookiePair = this.cookieHeaderParser.extractCookiePair(csrfCookieHeader);
    const csrfToken = this.cookieHeaderParser.extractCookieValue(csrfCookieHeader, "codemation.csrf-token");
    const login = await this.harness.request({
      method: "POST",
      url: ApiPaths.authLogin(),
      headers: {
        cookie: csrfCookiePair,
        origin: AuthEnforcementFixture.trustedOrigin,
        "content-type": "application/json",
        "x-codemation-csrf-token": csrfToken,
      },
      payload: JSON.stringify({
        email: LocalWorkflowSessionFactory.email,
        password: LocalWorkflowSessionFactory.password,
      }),
    });
    const sessionCookieHeader = this.cookieHeaderParser.requireHeaderString(login.header("set-cookie"));
    return {
      cookie: `${csrfCookiePair}; ${this.cookieHeaderParser.extractCookiePair(sessionCookieHeader)}`,
      origin: AuthEnforcementFixture.trustedOrigin,
    };
  }
}

describe("http auth enforcement", () => {
  const session = new IntegrationTestDatabaseSession();
  const cookieHeaderParser = new CookieHeaderParser();
  let harness: FrontendHttpIntegrationHarness;

  beforeAll(async () => {
    await session.start();
    harness = await AuthEnforcementFixture.createHarness(session.database!, session.transaction!);
  });

  afterEach(async () => {
    await harness.close();
    await session.afterEach();
    harness = await AuthEnforcementFixture.createHarness(session.database!, session.transaction!);
  });

  afterAll(async () => {
    await harness.close();
    await session.dispose();
  });

  it("returns 401 for protected API routes when no session is presented", async () => {
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflow(AuthEnforcementFixture.workflowId),
    });
    expect(response.statusCode).toBe(401);
  });

  it("allows anonymous webhook posts", async () => {
    const response = await harness.request({
      method: "POST",
      url: `${ApiPaths.webhooks()}/missing-endpoint`,
    });
    expect(response.statusCode).not.toBe(401);
  });

  it("accepts Better Auth cookie sessions on protected API routes", async () => {
    const headers = await new LocalWorkflowSessionFactory(
      cookieHeaderParser,
      harness,
      session.transaction!,
    ).createHeaders();
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.workflow(AuthEnforcementFixture.workflowId),
      headers,
    });
    expect(response.statusCode).toBe(200);
  });
});
