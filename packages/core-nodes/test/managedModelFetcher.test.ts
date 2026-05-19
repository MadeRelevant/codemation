/**
 * Tests for ManagedModelFetcher.
 *
 * ESLint forbids vi.stubEnv and vi.stubGlobal — process.env and globalThis.fetch
 * are saved and restored manually around each test.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { ManagedModelFetcher } from "../src/chatModels/ManagedModelFetcher";

const ENV_KEY = "CONTROL_PLANE_URL";

function saveEnv(): string | undefined {
  return process.env[ENV_KEY];
}

function restoreEnv(saved: string | undefined): void {
  if (saved === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = saved;
  }
}

describe("ManagedModelFetcher", () => {
  test("returns empty array when CONTROL_PLANE_URL is not set", async () => {
    const saved = saveEnv();
    delete process.env[ENV_KEY];
    try {
      const result = await new ManagedModelFetcher().fetch();
      assert.deepEqual(result, []);
    } finally {
      restoreEnv(saved);
    }
  });

  test("returns model list from successful CP fetch", async () => {
    const saved = saveEnv();
    process.env[ENV_KEY] = "https://cp.example.com";

    const models = [
      {
        id: "m1",
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        providerKey: "openai",
        inputCostPerMTok: 5,
        outputCostPerMTok: 15,
        contextWindow: 128000,
        tier: "premium",
      },
    ];

    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(models), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const result = await new ManagedModelFetcher().fetch();
      assert.deepEqual(result, models);
    } finally {
      globalThis.fetch = savedFetch;
      restoreEnv(saved);
    }
  });

  test("returns empty array when CP responds with non-ok status", async () => {
    const saved = saveEnv();
    process.env[ENV_KEY] = "https://cp.example.com";

    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Internal Server Error", { status: 500 });

    try {
      const result = await new ManagedModelFetcher().fetch();
      assert.deepEqual(result, []);
    } finally {
      globalThis.fetch = savedFetch;
      restoreEnv(saved);
    }
  });

  test("returns empty array when fetch throws", async () => {
    const saved = saveEnv();
    process.env[ENV_KEY] = "https://cp.example.com";

    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Network unreachable");
    };

    try {
      const result = await new ManagedModelFetcher().fetch();
      assert.deepEqual(result, []);
    } finally {
      globalThis.fetch = savedFetch;
      restoreEnv(saved);
    }
  });
});
