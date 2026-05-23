/**
 * Tests for CodemationChatModelFactory — HMAC signing and error paths.
 *
 * ESLint forbids vi.stubEnv, so we save/restore process.env manually.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { CodemationChatModelFactory } from "../src/chatModels/CodemationChatModelFactory";
import { CodemationChatModelConfig } from "../src/chatModels/CodemationChatModelConfig";

type EnvSnapshot = Partial<Record<string, string>>;

function snapshotEnv(keys: string[]): EnvSnapshot {
  const snap: EnvSnapshot = {};
  for (const key of keys) {
    snap[key] = process.env[key];
  }
  return snap;
}

function restoreEnv(snap: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snap)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

const ENV_KEYS = ["LLM_GATEWAY_URL", "WORKSPACE_ID", "WORKSPACE_PAIRING_SECRET"];

function makeCtx(): any {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    nodeId: "node-1",
    activationId: "act-1",
    config: {},
    data: {},
    binary: {},
    parent: undefined,
    now: () => new Date(),
  };
}

function makeConfig(model = "gpt-4o"): CodemationChatModelConfig {
  return new CodemationChatModelConfig("Test Model", model);
}

describe("CodemationChatModelFactory", () => {
  describe("create() — error paths", () => {
    it("throws when LLM_GATEWAY_URL is not set", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      try {
        delete process.env["LLM_GATEWAY_URL"];
        process.env["WORKSPACE_ID"] = "ws-test";
        process.env["WORKSPACE_PAIRING_SECRET"] = "aGVsbG8=";

        const factory = new CodemationChatModelFactory();
        let caught: Error | undefined;
        try {
          await factory.create({ config: makeConfig(), ctx: makeCtx() });
        } catch (err) {
          caught = err as Error;
        }
        assert.ok(caught, "expected factory.create to throw");
        assert.ok(caught.message.includes("LLM_GATEWAY_URL"), `unexpected message: ${caught.message}`);
      } finally {
        restoreEnv(snapshot);
      }
    });

    it("throws when WORKSPACE_ID is not set", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      try {
        process.env["LLM_GATEWAY_URL"] = "https://gateway.example.com";
        delete process.env["WORKSPACE_ID"];
        process.env["WORKSPACE_PAIRING_SECRET"] = "aGVsbG8=";

        const factory = new CodemationChatModelFactory();
        let caught: Error | undefined;
        try {
          await factory.create({ config: makeConfig(), ctx: makeCtx() });
        } catch (err) {
          caught = err as Error;
        }
        assert.ok(caught, "expected factory.create to throw");
        assert.ok(caught.message.includes("workspace pairing"), `unexpected message: ${caught.message}`);
      } finally {
        restoreEnv(snapshot);
      }
    });

    it("throws when WORKSPACE_PAIRING_SECRET is not set", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      try {
        process.env["LLM_GATEWAY_URL"] = "https://gateway.example.com";
        process.env["WORKSPACE_ID"] = "ws-test";
        delete process.env["WORKSPACE_PAIRING_SECRET"];

        const factory = new CodemationChatModelFactory();
        let caught: Error | undefined;
        try {
          await factory.create({ config: makeConfig(), ctx: makeCtx() });
        } catch (err) {
          caught = err as Error;
        }
        assert.ok(caught, "expected factory.create to throw");
        assert.ok(caught.message.includes("workspace pairing"), `unexpected message: ${caught.message}`);
      } finally {
        restoreEnv(snapshot);
      }
    });
  });

  describe("buildHmacAuthHeader (via intercepted fetch)", () => {
    it("Authorization header follows Codemation-Hmac v=1 format with required fields", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      let capturedAuthHeader: string | undefined;

      try {
        process.env["LLM_GATEWAY_URL"] = "https://gateway.example.com";
        process.env["WORKSPACE_ID"] = "ws-abc123";
        // A valid base64-encoded 32-byte secret
        process.env["WORKSPACE_PAIRING_SECRET"] = Buffer.from("a".repeat(32)).toString("base64");

        // Intercept global fetch to capture the Authorization header.
        const origFetch = globalThis.fetch;
        let fetchCalled = false;
        globalThis.fetch = async (input: any, init?: RequestInit): Promise<Response> => {
          fetchCalled = true;
          capturedAuthHeader = (init?.headers as Headers | undefined)?.get("Authorization") ?? undefined;
          // Return a minimal response so the code doesn't crash.
          return new Response(JSON.stringify({ choices: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        };

        try {
          const factory = new CodemationChatModelFactory();
          const result = await factory.create({ config: makeConfig("gpt-4o"), ctx: makeCtx() });

          // Invoke the custom fetch wrapper by calling the provider's fetch with a test request
          const hmacFetch = (result as any).languageModel?.provider?.fetch as typeof fetch | undefined;
          if (hmacFetch) {
            await hmacFetch("https://gateway.example.com/v1/chat/completions", {
              method: "POST",
              body: JSON.stringify({ model: "gpt-4o", messages: [] }),
              headers: {},
            });
          } else {
            // Access the fetch wrapper built inside create() directly via the factory private method
            const buildFetch = (factory as any).buildHmacSignedFetch.bind(factory);
            const wrappedFetch = buildFetch("ws-abc123", Buffer.from("a".repeat(32)).toString("base64"));
            await wrappedFetch("https://gateway.example.com/v1/chat/completions", {
              method: "POST",
              body: JSON.stringify({ model: "gpt-4o", messages: [] }),
            });
          }
          assert.ok(fetchCalled, "expected the HMAC-wrapped fetch to call globalThis.fetch");
        } finally {
          globalThis.fetch = origFetch;
        }
      } finally {
        restoreEnv(snapshot);
      }

      assert.ok(capturedAuthHeader, "expected Authorization header to be set");
      assert.ok(
        capturedAuthHeader.startsWith("Codemation-Hmac "),
        `expected header to start with 'Codemation-Hmac ', got: ${capturedAuthHeader}`,
      );
      assert.ok(capturedAuthHeader.includes("v=1"), `expected 'v=1' in header: ${capturedAuthHeader}`);
      assert.ok(capturedAuthHeader.includes("workspaceId=ws-abc123"), `expected workspaceId in header`);
      assert.ok(capturedAuthHeader.includes("ts="), `expected 'ts=' in header`);
      assert.ok(capturedAuthHeader.includes("nonce="), `expected 'nonce=' in header`);
      assert.ok(capturedAuthHeader.includes("sig="), `expected 'sig=' in header`);
    });

    it("Authorization header structure has all required Codemation-Hmac fields", () => {
      const factory = new CodemationChatModelFactory();
      // Use a known base64-encoded secret (32 bytes of 'b')
      const pairingSecret = Buffer.from("b".repeat(32)).toString("base64");
      const workspaceId = "ws-struct";

      // Access private method directly
      const buildHeader = (factory as any).buildHmacAuthHeader.bind(factory);

      const method = "POST";
      const url = "https://gateway.example.com/v1/chat/completions?foo=bar";
      const body = '{"model":"gpt-4o"}';

      const header: string = buildHeader(workspaceId, pairingSecret, method, url, body);
      assert.ok(header.startsWith("Codemation-Hmac "), "header format");

      // Parse out fields
      const fields: Record<string, string> = {};
      for (const part of header.replace("Codemation-Hmac ", "").split(",")) {
        const [key, ...rest] = part.split("=");
        if (key) fields[key.trim()] = rest.join("=");
      }
      assert.ok(fields["v"] === "1", "v=1 should be present");
      assert.ok(fields["workspaceId"] === workspaceId, "workspaceId should match");
      assert.ok(typeof fields["ts"] === "string" && Number(fields["ts"]) > 0, "ts should be a positive number");
      assert.ok(typeof fields["nonce"] === "string" && fields["nonce"].length > 0, "nonce should be non-empty");
      assert.ok(typeof fields["sig"] === "string" && fields["sig"].length > 0, "sig should be non-empty");
    });
  });

  describe("create() — happy path", () => {
    it("returns a ChatLanguageModel with correct provider and modelName", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      try {
        process.env["LLM_GATEWAY_URL"] = "https://gateway.example.com";
        process.env["WORKSPACE_ID"] = "ws-happy";
        process.env["WORKSPACE_PAIRING_SECRET"] = Buffer.from("c".repeat(32)).toString("base64");

        const factory = new CodemationChatModelFactory();
        const result = await factory.create({ config: makeConfig("claude-3-5-sonnet"), ctx: makeCtx() });

        assert.equal(result.provider, "codemation-managed");
        assert.equal(result.modelName, "claude-3-5-sonnet");
        assert.ok(result.languageModel, "languageModel should be set");
      } finally {
        restoreEnv(snapshot);
      }
    });

    it("passes config options (temperature, maxOutputTokens) to defaultCallOptions", async () => {
      const snapshot = snapshotEnv(ENV_KEYS);
      try {
        process.env["LLM_GATEWAY_URL"] = "https://gateway.example.com";
        process.env["WORKSPACE_ID"] = "ws-opts";
        process.env["WORKSPACE_PAIRING_SECRET"] = Buffer.from("d".repeat(32)).toString("base64");

        const factory = new CodemationChatModelFactory();
        const config = new CodemationChatModelConfig("With Options", "gpt-4o", undefined, {
          temperature: 0.7,
          maxTokens: 2048,
        });
        const result = await factory.create({ config, ctx: makeCtx() });

        assert.equal(result.defaultCallOptions?.temperature, 0.7);
        assert.equal(result.defaultCallOptions?.maxOutputTokens, 2048);
      } finally {
        restoreEnv(snapshot);
      }
    });
  });
});
