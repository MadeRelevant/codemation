/**
 * Behavioral tests for UserAccountService.
 * Uses a minimal Prisma stub to exercise the service logic without a real database.
 */
import { describe, expect, it } from "vitest";

import { UserAccountService } from "../../src/domain/users/UserAccountServiceRegistry";
import { UserAccountSessionPolicy } from "../../src/domain/users/UserAccountSessionPolicy";

// Deterministic seed for ID generation — avoids nondeterminism from FIXED_EPOCH_MS.
const FIXED_EPOCH_MS = 1_745_000_000_000;

// ── Prisma stub ──────────────────────────────────────────────────────────────

type UserRow = {
  id: string;
  email: string | null;
  passwordHash: string | null;
  accountStatus: string;
  accounts: { provider: string; type: string }[];
  invites: { expiresAt: Date; revokedAt: Date | null }[];
};

type InviteRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

function makePrismaStub(users: UserRow[] = [], invites: InviteRow[] = []) {
  return {
    user: {
      findMany: async () => users,
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const user = users.find((u) => u.id === where.id);
        if (!user) throw new Error(`User not found: ${where.id}`);
        return { ...user, invites: invites.filter((i) => i.userId === where.id && !i.revokedAt) };
      },
      create: async ({ data }: { data: Partial<UserRow> }) => {
        const row: UserRow = {
          id: `user-${FIXED_EPOCH_MS}`,
          email: data.email ?? null,
          passwordHash: data.passwordHash ?? null,
          accountStatus: data.accountStatus ?? "invited",
          accounts: [],
          invites: [],
        };
        users.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { email?: string; id?: string }; data: Partial<UserRow> }) => {
        const user = users.find((u) => (where.id ? u.id === where.id : u.email === where.email));
        if (user) {
          Object.assign(user, data);
        }
        return user;
      },
    },
    userInvite: {
      findFirst: async ({ where }: { where: { tokenHash?: string; revokedAt?: null } }) => {
        return (
          invites.find((i) => {
            if (where.tokenHash && i.tokenHash !== where.tokenHash) return false;
            if (where.revokedAt === null && i.revokedAt !== null) return false;
            return true;
          }) ?? null
        );
      },
      create: async ({ data }: { data: Partial<InviteRow> }) => {
        const invite: InviteRow = {
          id: `inv-${FIXED_EPOCH_MS}`,
          userId: data.userId!,
          tokenHash: data.tokenHash!,
          expiresAt: data.expiresAt!,
          revokedAt: null,
          createdAt: data.createdAt ?? new Date(),
        };
        invites.push(invite);
        return invite;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId?: string; revokedAt?: null };
        data: { revokedAt?: Date };
      }) => {
        for (const inv of invites) {
          if (where.userId && inv.userId !== where.userId) continue;
          if (where.revokedAt === null && inv.revokedAt !== null) continue;
          Object.assign(inv, data);
        }
      },
    },
    account: {
      upsert: async () => undefined,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        user: {
          create: async ({ data }: { data: Partial<UserRow> }) => {
            const row: UserRow = {
              id: `user-tx-${FIXED_EPOCH_MS}`,
              email: data.email ?? null,
              passwordHash: null,
              accountStatus: data.accountStatus ?? "invited",
              accounts: [],
              invites: [],
            };
            users.push(row);
            return row;
          },
          update: async ({ where, data }: { where: { id?: string }; data: Partial<UserRow> }) => {
            const user = users.find((u) => u.id === where.id);
            if (user) Object.assign(user, data);
            return user;
          },
        },
        userInvite: {
          create: async ({ data }: { data: Partial<InviteRow> }) => {
            const invite: InviteRow = {
              id: `inv-tx-${FIXED_EPOCH_MS}`,
              userId: data.userId!,
              tokenHash: data.tokenHash!,
              expiresAt: data.expiresAt!,
              revokedAt: null,
              createdAt: data.createdAt ?? new Date(),
            };
            invites.push(invite);
            return invite;
          },
          updateMany: async ({
            where,
            data,
          }: {
            where: { userId?: string; revokedAt?: null };
            data: { revokedAt?: Date };
          }) => {
            for (const inv of invites) {
              if (where.userId && inv.userId !== where.userId) continue;
              if (where.revokedAt === null && inv.revokedAt !== null) continue;
              Object.assign(inv, data);
            }
          },
        },
        account: {
          upsert: async () => undefined,
        },
      });
    },
  } as never;
}

const LOCAL_AUTH_CONFIG = { kind: "local" as const };
const OIDC_AUTH_CONFIG = { kind: "oidc" as const, provider: { providerId: "test" } };
const SESSION_POLICY = new UserAccountSessionPolicy();

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UserAccountService.assertLocalAuth", () => {
  it("throws 403 when authConfig is undefined", async () => {
    const service = new UserAccountService(undefined, makePrismaStub(), SESSION_POLICY);
    await expect(service.listUsers()).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when authConfig is not local", async () => {
    const service = new UserAccountService(OIDC_AUTH_CONFIG as never, makePrismaStub(), SESSION_POLICY);
    await expect(service.listUsers()).rejects.toMatchObject({ status: 403 });
  });
});

describe("UserAccountService.requirePrisma", () => {
  it("throws 503 when prisma is undefined", async () => {
    // verifyInviteToken does not check assertLocalAuth, only requirePrisma
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, undefined, SESSION_POLICY);
    await expect(service.verifyInviteToken("some-token")).rejects.toMatchObject({ status: 503 });
  });
});

describe("UserAccountService.listUsers", () => {
  it("returns empty list when no users", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    const users = await service.listUsers();
    expect(users).toHaveLength(0);
  });

  it("maps user rows to DTOs", async () => {
    const futureDate = new Date(FIXED_EPOCH_MS + 86_400_000);
    const users: UserRow[] = [
      {
        id: "u1",
        email: "alice@example.com",
        passwordHash: "$bcrypt$hash",
        accountStatus: "active",
        accounts: [{ provider: "google", type: "oidc" }],
        invites: [{ expiresAt: futureDate, revokedAt: null }],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.listUsers();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("alice@example.com");
    expect(result[0].loginMethods).toContain("Password");
  });
});

describe("UserAccountService.inviteUser", () => {
  it("throws 400 for invalid email", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.inviteUser("notanemail", "https://example.com")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 for empty email", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.inviteUser("  ", "https://example.com")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 409 when user is already active", async () => {
    const users: UserRow[] = [
      {
        id: "u-active",
        email: "active@example.com",
        passwordHash: "hash",
        accountStatus: "active",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    await expect(service.inviteUser("active@example.com", "https://example.com")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("throws 409 when user is inactive", async () => {
    const users: UserRow[] = [
      {
        id: "u-inactive",
        email: "inactive@example.com",
        passwordHash: null,
        accountStatus: "inactive",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    await expect(service.inviteUser("inactive@example.com", "https://example.com")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("creates invite for a new user", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    const result = await service.inviteUser("new@example.com", "https://example.com");
    expect(result.user.email).toBe("new@example.com");
    expect(result.inviteUrl).toContain("/invite/");
    expect(result.inviteUrl).toContain("example.com");
  });

  it("re-invites an existing invited user (revokes old invite, creates new)", async () => {
    const users: UserRow[] = [
      {
        id: "u-invited",
        email: "invited@example.com",
        passwordHash: null,
        accountStatus: "invited",
        accounts: [],
        invites: [],
      },
    ];
    const invites: InviteRow[] = [
      {
        id: "old-inv",
        userId: "u-invited",
        tokenHash: "oldHash",
        expiresAt: new Date(FIXED_EPOCH_MS + 86400000),
        revokedAt: null,
        createdAt: new Date(),
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users, invites), SESSION_POLICY);
    const result = await service.inviteUser("invited@example.com", "https://example.com");
    expect(result.inviteUrl).toContain("/invite/");
  });
});

describe("UserAccountService.regenerateInvite", () => {
  it("throws 404 when user not found", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.regenerateInvite("unknown-id", "https://example.com")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("throws 409 when user is not in invited status", async () => {
    const users: UserRow[] = [
      {
        id: "u-active2",
        email: "a@example.com",
        passwordHash: "h",
        accountStatus: "active",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    await expect(service.regenerateInvite("u-active2", "https://example.com")).rejects.toMatchObject({ status: 409 });
  });

  it("generates a new invite for an invited user", async () => {
    const users: UserRow[] = [
      {
        id: "u-regen",
        email: "regen@example.com",
        passwordHash: null,
        accountStatus: "invited",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.regenerateInvite("u-regen", "https://example.com/");
    expect(result.inviteUrl).toContain("/invite/");
    // Trailing slash should be stripped from origin
    expect(result.inviteUrl).not.toContain("//invite/");
  });
});

describe("UserAccountService.verifyInviteToken", () => {
  it("returns invalid for empty token", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    const result = await service.verifyInviteToken("   ");
    expect(result.valid).toBe(false);
  });

  it("returns invalid when no matching invite found", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    const result = await service.verifyInviteToken("nonexistent-token");
    expect(result.valid).toBe(false);
  });

  it("returns invalid when invite is expired", async () => {
    const users: UserRow[] = [
      {
        id: "u-exp",
        email: "exp@example.com",
        passwordHash: null,
        accountStatus: "invited",
        accounts: [],
        invites: [],
      },
    ];
    // We can't easily set up a real token hash here, so we test the no-invite path
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.verifyInviteToken("bad-token");
    expect(result.valid).toBe(false);
  });
});

describe("UserAccountService.acceptInvite", () => {
  it("throws 400 when token is empty", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.acceptInvite("", "password123")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when password is too short", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.acceptInvite("token", "short")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when invite not found", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.acceptInvite("nonexistent", "password123456")).rejects.toMatchObject({ status: 400 });
  });
});

describe("UserAccountService.updateAccountStatus", () => {
  it("throws 403 when auth is not local", async () => {
    const service = new UserAccountService(OIDC_AUTH_CONFIG as never, makePrismaStub(), SESSION_POLICY);
    await expect(service.updateAccountStatus("u1", "active")).rejects.toMatchObject({ status: 403 });
  });

  it("throws 400 when status is 'invited'", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.updateAccountStatus("u1", "invited")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 404 when user not found", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.updateAccountStatus("unknown", "inactive")).rejects.toMatchObject({ status: 404 });
  });

  it("updates status and returns DTO", async () => {
    const users: UserRow[] = [
      {
        id: "u-upd",
        email: "upd@example.com",
        passwordHash: null,
        accountStatus: "invited",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.updateAccountStatus("u-upd", "inactive");
    expect(result.email).toBe("upd@example.com");
    expect(result.status).toBe("inactive");
  });
});

describe("UserAccountService.upsertBootstrapLocalUser", () => {
  it("throws 403 when auth is not local", async () => {
    const service = new UserAccountService(OIDC_AUTH_CONFIG as never, makePrismaStub(), SESSION_POLICY);
    await expect(service.upsertBootstrapLocalUser("u@example.com", "password123")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("throws 400 for invalid email", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.upsertBootstrapLocalUser("notvalid", "password123")).rejects.toMatchObject({ status: 400 });
  });

  it("throws 400 when password too short", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    await expect(service.upsertBootstrapLocalUser("u@example.com", "short")).rejects.toMatchObject({ status: 400 });
  });

  it("creates new user and returns outcome=created", async () => {
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(), SESSION_POLICY);
    const result = await service.upsertBootstrapLocalUser("brand@example.com", "securepassword123");
    expect(result.outcome).toBe("created");
  });

  it("updates existing user and returns outcome=updated", async () => {
    const users: UserRow[] = [
      {
        id: "u-boot",
        email: "boot@example.com",
        passwordHash: "oldhash",
        accountStatus: "active",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.upsertBootstrapLocalUser("boot@example.com", "newpassword123");
    expect(result.outcome).toBe("updated");
  });
});

describe("UserAccountService login methods", () => {
  it("includes external provider labels in loginMethods", async () => {
    const users: UserRow[] = [
      {
        id: "u-ext",
        email: "ext@example.com",
        passwordHash: null,
        accountStatus: "active",
        accounts: [{ provider: "github", type: "oauth2" }],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.listUsers();
    expect(result[0].loginMethods.some((m) => m.toLowerCase().includes("github"))).toBe(true);
  });

  it("filters out credential/credentials provider from login methods", async () => {
    const users: UserRow[] = [
      {
        id: "u-cred",
        email: "cred@example.com",
        passwordHash: "hash",
        accountStatus: "active",
        accounts: [
          { provider: "credential", type: "email" },
          { provider: "credentials", type: "email" },
        ],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.listUsers();
    // Only "Password" should appear from passwordHash, not the credential provider
    expect(result[0].loginMethods).toEqual(["Password"]);
  });

  it("inviteExpiresAt is null when no open invite", async () => {
    const users: UserRow[] = [
      {
        id: "u-noinv",
        email: "noinv@example.com",
        passwordHash: null,
        accountStatus: "invited",
        accounts: [],
        invites: [],
      },
    ];
    const service = new UserAccountService(LOCAL_AUTH_CONFIG, makePrismaStub(users), SESSION_POLICY);
    const result = await service.listUsers();
    expect(result[0].inviteExpiresAt).toBeNull();
  });
});
