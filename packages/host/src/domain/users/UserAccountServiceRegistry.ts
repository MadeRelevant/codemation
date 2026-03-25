import { hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import type {
  InviteUserResponseDto,
  UserAccountDto,
  UserAccountStatus,
  VerifyUserInviteResponseDto,
} from "../../application/contracts/userDirectoryContracts.types";
import { PrismaClient } from "../../infrastructure/persistence/generated/prisma-client/client.js";
import type { CodemationAuthConfig } from "../../presentation/config/CodemationAuthConfig";
import { labelForLinkedAuthAccount } from "./userLoginMethodLabels.types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class UserAccountService {
  constructor(
    private readonly authConfig: CodemationAuthConfig | undefined,
    private readonly prisma: PrismaClient | undefined,
  ) {}

  async listUsers(): Promise<ReadonlyArray<UserAccountDto>> {
    this.assertLocalAuth();
    const prisma = this.requirePrisma();
    const rows = await prisma.user.findMany({
      orderBy: { email: "asc" },
      include: {
        invites: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
        },
        accounts: {
          select: { provider: true, type: true },
        },
      },
    });
    return rows.map((row) => this.toDto(row));
  }

  async inviteUser(email: string, requestOrigin: string): Promise<InviteUserResponseDto> {
    this.assertLocalAuth();
    const prisma = this.requirePrisma();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      throw new ApplicationRequestError(400, "Invalid email.");
    }
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing?.accountStatus === "active") {
      throw new ApplicationRequestError(409, "User is already active.");
    }
    if (existing?.accountStatus === "inactive") {
      throw new ApplicationRequestError(409, "User is inactive.");
    }

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = new Date();

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.userInvite.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.userInvite.create({
          data: { userId: existing.id, tokenHash, expiresAt, createdAt: now },
        });
      });
      const user = await this.getUserDto(existing.id);
      return { user, inviteUrl: this.buildInviteUrl(requestOrigin, rawToken) };
    }

    const created = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: normalized,
          name: normalized.split("@")[0] ?? normalized,
          accountStatus: "invited",
        },
      });
      await tx.userInvite.create({
        data: { userId: u.id, tokenHash, expiresAt, createdAt: now },
      });
      return u;
    });
    const user = await this.getUserDto(created.id);
    return { user, inviteUrl: this.buildInviteUrl(requestOrigin, rawToken) };
  }

  async regenerateInvite(userId: string, requestOrigin: string): Promise<InviteUserResponseDto> {
    this.assertLocalAuth();
    const prisma = this.requirePrisma();
    const row = await prisma.user.findUnique({ where: { id: userId } });
    if (!row) {
      throw new ApplicationRequestError(404, "Unknown user.");
    }
    if (row.accountStatus !== "invited") {
      throw new ApplicationRequestError(409, "Can only regenerate invites for invited users.");
    }

    const rawToken = this.generateRawToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.userInvite.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.userInvite.create({
        data: { userId, tokenHash, expiresAt, createdAt: now },
      });
    });

    const user = await this.getUserDto(userId);
    return { user, inviteUrl: this.buildInviteUrl(requestOrigin, rawToken) };
  }

  async verifyInviteToken(rawToken: string): Promise<VerifyUserInviteResponseDto> {
    const prisma = this.requirePrisma();
    const trimmed = rawToken.trim();
    if (!trimmed) {
      return { valid: false };
    }
    const tokenHash = this.hashToken(trimmed);
    const invite = await prisma.userInvite.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!invite || invite.expiresAt <= new Date()) {
      return { valid: false };
    }
    const user = await prisma.user.findUnique({ where: { id: invite.userId } });
    if (!user?.email || user.accountStatus !== "invited") {
      return { valid: false };
    }
    return { valid: true, email: user.email };
  }

  async acceptInvite(rawToken: string, password: string): Promise<void> {
    const prisma = this.requirePrisma();
    const trimmed = rawToken.trim();
    if (!trimmed) {
      throw new ApplicationRequestError(400, "Missing invite token.");
    }
    if (password.length < 8) {
      throw new ApplicationRequestError(400, "Password must be at least 8 characters.");
    }
    const tokenHash = this.hashToken(trimmed);
    const invite = await prisma.userInvite.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!invite || invite.expiresAt <= new Date()) {
      throw new ApplicationRequestError(400, "Invite is invalid or has expired.");
    }
    const user = await prisma.user.findUnique({ where: { id: invite.userId } });
    if (!user || user.accountStatus !== "invited") {
      throw new ApplicationRequestError(400, "Invite cannot be used for this account.");
    }
    const passwordHash = await hash(password, 12);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, accountStatus: "active" },
      });
      await tx.userInvite.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async updateAccountStatus(userId: string, status: UserAccountStatus): Promise<UserAccountDto> {
    this.assertLocalAuth();
    const prisma = this.requirePrisma();
    if (status === "invited") {
      throw new ApplicationRequestError(400, "Cannot set status to invited via this endpoint.");
    }
    const row = await prisma.user.findUnique({ where: { id: userId } });
    if (!row) {
      throw new ApplicationRequestError(404, "Unknown user.");
    }
    await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: status },
    });
    return await this.getUserDto(userId);
  }

  private buildInviteUrl(origin: string, rawToken: string): string {
    const base = origin.replace(/\/$/, "");
    return `${base}/invite/${encodeURIComponent(rawToken)}`;
  }

  private hashToken(raw: string): string {
    return createHash("sha256").update(raw, "utf8").digest("hex");
  }

  private generateRawToken(): string {
    return randomBytes(32).toString("base64url");
  }

  private assertLocalAuth(): void {
    if (this.authConfig?.kind !== "local") {
      throw new ApplicationRequestError(403, "User management requires local authentication.");
    }
  }

  private requirePrisma(): PrismaClient {
    if (!this.prisma) {
      throw new ApplicationRequestError(503, "User management requires a database.");
    }
    return this.prisma;
  }

  private async getUserDto(userId: string): Promise<UserAccountDto> {
    const prisma = this.requirePrisma();
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        invites: {
          where: { revokedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        accounts: {
          select: { provider: true, type: true },
        },
      },
    });
    return this.toDto(row);
  }

  private toDto(row: {
    id: string;
    email: string | null;
    accountStatus: string;
    passwordHash: string | null;
    accounts: ReadonlyArray<{ provider: string; type: string }>;
    invites: ReadonlyArray<{ expiresAt: Date }>;
  }): UserAccountDto {
    const now = new Date();
    const open = row.invites[0];
    const inviteExpiresAt = open && open.expiresAt > now ? open.expiresAt.toISOString() : null;
    return {
      id: row.id,
      email: row.email ?? "",
      status: row.accountStatus as UserAccountStatus,
      inviteExpiresAt,
      loginMethods: UserAccountService.buildLoginMethods(row),
    };
  }

  private static buildLoginMethods(row: {
    passwordHash: string | null;
    accounts: ReadonlyArray<{ provider: string; type: string }>;
  }): ReadonlyArray<string> {
    const labels: string[] = [];
    const seen = new Set<string>();
    if (row.passwordHash && row.passwordHash.length > 0) {
      labels.push("Password");
      seen.add("Password");
    }
    for (const account of row.accounts) {
      if (account.provider === "credentials") {
        continue;
      }
      const label = labelForLinkedAuthAccount(account.provider, account.type);
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    const password = labels.filter((l) => l === "Password");
    const rest = labels.filter((l) => l !== "Password").sort((a, b) => a.localeCompare(b));
    return [...password, ...rest];
  }
}
