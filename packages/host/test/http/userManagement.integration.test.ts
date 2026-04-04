// @vitest-environment node

import { encode } from "@auth/core/jwt";
import type { WorkflowDefinition } from "@codemation/core";
import { createWorkflowBuilder, ManualTrigger } from "@codemation/core-nodes";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type {
  InviteUserResponseDto,
  UserAccountDto,
} from "../../src/application/contracts/userDirectoryContracts.types";
import { ApplicationTokens } from "../../src/applicationTokens";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";
import type { IntegrationDatabase } from "./testkit/IntegrationDatabaseFactory";
import { IntegrationTestDatabaseSession } from "./testkit/IntegrationTestDatabaseSession";
import { mergeIntegrationDatabaseRuntime } from "./testkit/mergeIntegrationDatabaseRuntime";
import type { PostgresRollbackTransaction } from "./testkit/PostgresRollbackTransaction";

const authSecret = "codemation-user-mgmt-test-secret-min-32-chars";

class UserManagementFixture {
  static readonly workflowId = "wf.user.mgmt.integration";

  static createWorkflow(): WorkflowDefinition {
    return createWorkflowBuilder({
      id: this.workflowId,
      name: "User management integration",
    })
      .trigger(new ManualTrigger("Manual", "trigger"))
      .build();
  }

  static createLocalAuthConfig(): CodemationConfig {
    return {
      workflows: [this.createWorkflow()],
      runtime: {
        eventBus: { kind: "memory" as const },
        scheduler: { kind: "local" as const },
      },
      auth: { kind: "local" as const },
    };
  }

  static async createHarness(
    database: IntegrationDatabase,
    transaction: PostgresRollbackTransaction,
    config: CodemationConfig,
  ): Promise<FrontendHttpIntegrationHarness> {
    const harness = new FrontendHttpIntegrationHarness({
      config: mergeIntegrationDatabaseRuntime(config, database),
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
}

async function authHeaders(): Promise<Readonly<Record<string, string>>> {
  const token = await encode({
    secret: authSecret,
    salt: "authjs.session-token",
    token: {
      sub: "integration-admin",
      email: "admin@codemation.test",
      name: "Admin",
    },
  });
  return { authorization: `Bearer ${encodeURIComponent(token)}` };
}

function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function extractRawTokenFromInviteUrl(inviteUrl: string): string {
  const match = inviteUrl.match(/\/invite\/([^/?#]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not parse invite URL: ${inviteUrl}`);
  }
  return decodeURIComponent(match[1]);
}

describe("user management http integration", () => {
  const session = new IntegrationTestDatabaseSession();

  beforeAll(async () => {
    await session.start();
  });

  afterEach(async () => {
    await session.afterEach();
  });

  afterAll(async () => {
    await session.dispose();
  });

  it("returns 401 for GET /users without session when local auth is enforced", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const response = await harness.request({ method: "GET", url: ApiPaths.users() });
    expect(response.statusCode).toBe(401);
    await harness.close();
  });

  it("lists users with valid session", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    await prisma.user.create({
      data: { email: "alpha@example.com", name: "Alpha", accountStatus: "active" },
    });
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.users(),
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(200);
    const list = response.json<ReadonlyArray<UserAccountDto>>();
    const alpha = list.find((u) => u.email === "alpha@example.com");
    expect(alpha?.status).toBe("active");
    expect(alpha?.loginMethods).toEqual([]);
    await harness.close();
  });

  it("lists sign-in methods for password and linked OAuth accounts", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    const withOAuth = await prisma.user.create({
      data: { email: "oauth@example.com", name: "OAuth", accountStatus: "active" },
    });
    await prisma.account.create({
      data: {
        userId: withOAuth.id,
        type: "oauth",
        provider: "google",
        providerAccountId: "google-sub-1",
      },
    });
    const withPassword = await prisma.user.create({
      data: {
        email: "both@example.com",
        name: "Both",
        accountStatus: "active",
        passwordHash: "hashed",
      },
    });
    await prisma.account.create({
      data: {
        userId: withPassword.id,
        type: "oauth",
        provider: "github",
        providerAccountId: "gh-1",
      },
    });

    const list = await harness.requestJson<ReadonlyArray<UserAccountDto>>({
      method: "GET",
      url: ApiPaths.users(),
      headers: await authHeaders(),
    });
    expect(list.find((u) => u.email === "oauth@example.com")?.loginMethods).toEqual(["Google"]);
    expect(list.find((u) => u.email === "both@example.com")?.loginMethods).toEqual(["Password", "GitHub"]);
    await harness.close();
  });

  it("returns 403 for user routes when auth kind is not local", async () => {
    const harness = await UserManagementFixture.createHarness(session.database!, session.transaction!, {
      ...UserManagementFixture.createLocalAuthConfig(),
      auth: { kind: "oauth" },
    });
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.users(),
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(403);
    await harness.close();
  });

  it("invite, verify, accept, and login-ready user flow", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const created = await harness.requestJson<InviteUserResponseDto>({
      method: "POST",
      url: ApiPaths.userInvites(),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: { email: "newuser@example.com" },
    });
    expect(created.user.email).toBe("newuser@example.com");
    expect(created.user.status).toBe("invited");
    expect(created.inviteUrl).toContain("/invite/");

    const rawToken = extractRawTokenFromInviteUrl(created.inviteUrl);

    const verify = await harness.request({
      method: "GET",
      url: `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(rawToken)}`,
    });
    expect(verify.statusCode).toBe(200);
    const verifyBody = verify.json<{ valid: boolean; email?: string }>();
    expect(verifyBody.valid).toBe(true);
    expect(verifyBody.email).toBe("newuser@example.com");

    const accept = await harness.request({
      method: "POST",
      url: ApiPaths.userInviteAccept(),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: rawToken, password: "longpassword123" }),
    });
    expect(accept.statusCode).toBe(204);

    const verifyAfter = await harness.request({
      method: "GET",
      url: `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(rawToken)}`,
    });
    expect(verifyAfter.json<{ valid: boolean }>().valid).toBe(false);

    const list = await harness.requestJson<ReadonlyArray<UserAccountDto>>({
      method: "GET",
      url: ApiPaths.users(),
      headers: await authHeaders(),
    });
    const row = list.find((u) => u.email === "newuser@example.com");
    expect(row?.status).toBe("active");
    expect(row?.loginMethods).toEqual(["Password"]);
    await harness.close();
  });

  it("rejects invite for already-active email", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    await prisma.user.create({
      data: { email: "existing@example.com", name: "Existing", accountStatus: "active", passwordHash: "x" },
    });
    const response = await harness.request({
      method: "POST",
      url: ApiPaths.userInvites(),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: JSON.stringify({ email: "existing@example.com" }),
    });
    expect(response.statusCode).toBe(409);
    await harness.close();
  });

  it("stores invite expiry within a seven-day window", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const created = await harness.requestJson<InviteUserResponseDto>({
      method: "POST",
      url: ApiPaths.userInvites(),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: { email: "ttl@example.com" },
    });
    const prisma = session.transaction!.getPrismaClient();
    const invite = await prisma.userInvite.findFirst({
      where: { userId: created.user.id, revokedAt: null },
    });
    expect(invite).not.toBeNull();
    const deltaMs = invite!.expiresAt.getTime() - invite!.createdAt.getTime();
    expect(deltaMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(deltaMs).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    await harness.close();
  });

  it("regenerate invalidates the previous token", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const first = await harness.requestJson<InviteUserResponseDto>({
      method: "POST",
      url: ApiPaths.userInvites(),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: { email: "regen@example.com" },
    });
    const tokenA = extractRawTokenFromInviteUrl(first.inviteUrl);

    const second = await harness.requestJson<InviteUserResponseDto>({
      method: "POST",
      url: ApiPaths.userInviteRegenerate(first.user.id),
      headers: await authHeaders(),
    });
    const tokenB = extractRawTokenFromInviteUrl(second.inviteUrl);
    expect(tokenA).not.toBe(tokenB);

    const verifyOld = await harness.request({
      method: "GET",
      url: `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(tokenA)}`,
    });
    expect(verifyOld.json<{ valid: boolean }>().valid).toBe(false);

    const verifyNew = await harness.request({
      method: "GET",
      url: `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(tokenB)}`,
    });
    expect(verifyNew.json<{ valid: boolean }>().valid).toBe(true);
    await harness.close();
  });

  it("returns 409 when regenerating for a non-invited user", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    const u = await prisma.user.create({
      data: { email: "activeonly@example.com", name: "A", accountStatus: "active" },
    });
    const response = await harness.request({
      method: "POST",
      url: ApiPaths.userInviteRegenerate(u.id),
      headers: await authHeaders(),
    });
    expect(response.statusCode).toBe(409);
    await harness.close();
  });

  it("verify returns invalid for expired invite", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    const u = await prisma.user.create({
      data: { email: "expired@example.com", name: "E", accountStatus: "invited" },
    });
    const raw = "expired-test-token";
    const expiredInviteRefMs = 1_700_000_000_000;
    await prisma.userInvite.create({
      data: {
        userId: u.id,
        tokenHash: hashInviteToken(raw),
        expiresAt: new Date(expiredInviteRefMs - 60_000),
        createdAt: new Date(expiredInviteRefMs - 120_000),
      },
    });
    const response = await harness.request({
      method: "GET",
      url: `${ApiPaths.userInviteVerify()}?token=${encodeURIComponent(raw)}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ valid: boolean }>().valid).toBe(false);
    await harness.close();
  });

  it("accept rejects short password", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const created = await harness.requestJson<InviteUserResponseDto>({
      method: "POST",
      url: ApiPaths.userInvites(),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: { email: "shortpw@example.com" },
    });
    const rawToken = extractRawTokenFromInviteUrl(created.inviteUrl);
    const response = await harness.request({
      method: "POST",
      url: ApiPaths.userInviteAccept(),
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: rawToken, password: "short" }),
    });
    expect(response.statusCode).toBe(400);
    await harness.close();
  });

  it("patch status updates account", async () => {
    const harness = await UserManagementFixture.createHarness(
      session.database!,
      session.transaction!,
      UserManagementFixture.createLocalAuthConfig(),
    );
    const prisma = session.transaction!.getPrismaClient();
    const u = await prisma.user.create({
      data: { email: "patch@example.com", name: "P", accountStatus: "active" },
    });
    const updated = await harness.requestJson<UserAccountDto>({
      method: "PATCH",
      url: ApiPaths.userStatus(u.id),
      headers: { ...(await authHeaders()), "content-type": "application/json" },
      payload: { status: "inactive" },
    });
    expect(updated.status).toBe("inactive");
    expect(updated.loginMethods).toEqual([]);
    await harness.close();
  });
});
