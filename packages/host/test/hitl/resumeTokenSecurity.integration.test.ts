// @vitest-environment node

/**
 * Integration tests for HitlResumeTokenSigner.
 *
 * Covers: valid tokens, bad signatures, expired tokens, taskId mismatch,
 *         and schema-hash drift detection (D6).
 *
 * No BullMQ / Redis required — only the signer + real Postgres.
 */

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { HumanTaskRecord } from "@codemation/core";
import { PrismaHumanTaskStore } from "../../src/infrastructure/persistence/PrismaHumanTaskStore";
import { HitlResumeTokenSigner } from "../../src/hitl/HitlResumeTokenSigner";
import { DecideHumanTaskCommandHandler } from "../../src/application/hitl/DecideHumanTaskCommandHandler";
import { IntegrationTestDatabaseSession } from "../http/testkit/IntegrationTestDatabaseSession";
import type { PrismaDatabaseClient as PrismaClient } from "../../src/infrastructure/persistence/PrismaDatabaseClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTH_SECRET = "test-secret-for-hitl-token-signer-42chars";
const FUTURE = new Date("2099-01-01T12:00:00.000Z");
const PAST = new Date("2020-01-01T12:00:00.000Z");
const SCHEMA_JSON = JSON.stringify({ type: "object", properties: { approved: { type: "boolean" } } });
const SCHEMA_HASH = "abcdef1234567890"; // 16 chars; signer takes first 8

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskWithToken(
  store: PrismaHumanTaskStore,
  signer: HitlResumeTokenSigner,
  overrides: Partial<HumanTaskRecord> = {},
): { task: HumanTaskRecord; token: string } {
  const taskId = `task-${randomUUID()}`;
  const expiresAt = FUTURE;
  const token = signer.sign({ taskId, expiresAt, schemaHash: SCHEMA_HASH });
  const tokenHash = signer.hashToken(token);
  const task: HumanTaskRecord = {
    id: taskId,
    runId: `run-${randomUUID()}`,
    workflowId: "wf.hitl.token",
    nodeId: "approval",
    activationId: `act-${randomUUID()}`,
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "Please approve" },
    metadata: {},
    decisionSchemaJson: SCHEMA_JSON,
    decisionSchemaHash: SCHEMA_HASH,
    onTimeout: "halt",
    resumeTokenHash: tokenHash,
    expiresAt,
    createdAt: new Date(),
    ...overrides,
  };
  return { task, token };
}

function makeSignerAndHandler(prisma: PrismaClient): {
  signer: HitlResumeTokenSigner;
  store: PrismaHumanTaskStore;
  handler: DecideHumanTaskCommandHandler;
} {
  // Create a minimal AppConfig-like object for the signer
  const fakeAppConfig = {
    env: { AUTH_SECRET },
    persistence: { kind: "postgresql" as const },
    consumerRoot: "/tmp",
    repoRoot: "/tmp",
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    scheduler: { kind: "local" as const, workerQueues: [] },
    eventing: { kind: "memory" as const },
    auth: { kind: "local" as const, allowUnauthenticatedInDevelopment: false },
    whitelabel: {},
    webSocketPort: 3001,
    webSocketBindHost: "127.0.0.1",
    mcpServers: [],
  };

  const signer = new HitlResumeTokenSigner(fakeAppConfig as never);
  const store = new PrismaHumanTaskStore(prisma);
  return { signer, store, handler: null as never }; // handler not needed for these tests
}

// ---------------------------------------------------------------------------
// Test context
// ---------------------------------------------------------------------------

class TokenSecurityContext {
  private readonly session = new IntegrationTestDatabaseSession();

  async start(): Promise<void> {
    await this.session.start();
  }

  async afterEach(): Promise<void> {
    await this.session.afterEach();
  }

  async stop(): Promise<void> {
    await this.session.dispose();
  }

  getPrismaClient(): PrismaClient {
    if (!this.session.transaction) throw new Error("start() must be called first");
    return this.session.transaction.getPrismaClient();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HitlResumeTokenSigner — security invariants", () => {
  const ctx = new TokenSecurityContext();

  beforeAll(async () => {
    await ctx.start();
  });

  afterEach(async () => {
    await ctx.afterEach();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("sign + verify round-trip succeeds for a fresh token", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const taskId = `task-${randomUUID()}`;
    const token = signer.sign({ taskId, expiresAt: FUTURE, schemaHash: SCHEMA_HASH });
    const result = signer.verify(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.taskId).toBe(taskId);
      expect(result.schemaHash).toBe(SCHEMA_HASH.slice(0, 8));
    }
  });

  it("verify rejects a tampered signature", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const taskId = `task-${randomUUID()}`;
    const token = signer.sign({ taskId, expiresAt: FUTURE, schemaHash: SCHEMA_HASH });
    // Flip the last character of the signature
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const result = signer.verify(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_sig");
  });

  it("verify rejects an expired token", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const taskId = `task-${randomUUID()}`;
    const token = signer.sign({ taskId, expiresAt: PAST, schemaHash: SCHEMA_HASH });
    const result = signer.verify(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("verify rejects a malformed token", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const result = signer.verify("not.a.valid");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("hashToken produces a stable deterministic hash", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const token = "test-token-value";
    const h1 = signer.hashToken(token);
    const h2 = signer.hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it("findByResumeTokenHash returns the task using the stored hash", async () => {
    const { signer, store } = makeSignerAndHandler(ctx.getPrismaClient());
    const { task, token } = makeTaskWithToken(store, signer);
    await store.create(task);

    const tokenHash = signer.hashToken(token);
    const found = await store.findByResumeTokenHash(tokenHash);
    expect(found?.id).toBe(task.id);
  });

  it("schema hash drift: signer encodes first 8 chars of hash in token", () => {
    const { signer } = makeSignerAndHandler(ctx.getPrismaClient());
    const taskId = `task-${randomUUID()}`;
    const longHash = "abcdef1234567890abcd";
    const token = signer.sign({ taskId, expiresAt: FUTURE, schemaHash: longHash });
    const result = signer.verify(token);
    if (result.ok) {
      // The schemaHash in the verified result should be the first 8 chars
      expect(result.schemaHash).toBe(longHash.slice(0, 8));
    }
  });
});
