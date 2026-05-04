import "reflect-metadata";

import { defineRestNode } from "../src/authoring/defineRestNode.types";
import { bearerTokenCredentialType } from "../src/credentials/BearerTokenCredentialType";
import { WorkflowTestKit } from "@codemation/core/testing";
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { z } from "zod";

describe("defineRestNode", () => {
  test("emits a DefinedNode with the correct key and title", () => {
    const node = defineRestNode({
      key: "test.get-user",
      title: "Get User",
      api: { baseUrl: "https://api.example.com", path: "/users/{id}", method: "GET" },
    });
    assert.equal(node.key, "test.get-user");
    assert.equal(node.title, "Get User");
    assert.equal(node.kind, "defined-node");
  });

  test("creates a config with correct credential requirements when credentials provided", () => {
    const node = defineRestNode({
      key: "test.auth-node",
      title: "Auth Node",
      api: { baseUrl: "https://api.example.com", path: "/protected", method: "GET" },
      credentials: { auth: bearerTokenCredentialType },
    });
    const config = node.create({});
    const requirements = config.getCredentialRequirements();
    assert.equal(requirements.length, 1);
    assert.equal(requirements[0]?.slotKey, "auth");
    assert.ok(requirements[0]?.acceptedTypes.includes(bearerTokenCredentialType.definition.typeId));
  });

  test("executes GET request and maps response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: RequestInfo | URL, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : String(url);
      if (urlStr.includes("/users/42")) {
        return new Response(JSON.stringify({ id: 42, name: "Alice" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    };

    try {
      const kit = new WorkflowTestKit();
      const getUser = defineRestNode({
        key: "test.get-user-exec",
        title: "Get User",
        api: { baseUrl: "https://api.example.com", path: "/users/{id}", method: "GET" },
        inputSchema: z.object({ id: z.string() }),
        response: ({ json }) => {
          const data = json as { id: number; name: string };
          return { userId: data.id, userName: data.name };
        },
      });
      kit.registerDefinedNodes([getUser]);

      const result = await kit.runNode({ node: getUser.create({}), items: [{ json: { id: "42" } }] });
      assert.equal(result.status, "completed");
      assert.ok(result.status === "completed");
      const item = result.status === "completed" ? result.outputs[0] : undefined;
      assert.ok(item);
      const output = item.json as { userId: number; userName: string };
      assert.equal(output.userId, 42);
      assert.equal(output.userName, "Alice");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws on non-2xx response with errorPolicy=throw (default)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404, statusText: "Not Found" });

    try {
      const kit = new WorkflowTestKit();
      const getUser = defineRestNode({
        key: "test.get-user-throw",
        title: "Get User",
        api: { baseUrl: "https://api.example.com", path: "/users/{id}", method: "GET" },
        inputSchema: z.object({ id: z.string() }),
      });
      kit.registerDefinedNodes([getUser]);

      const result = await kit.runNode({ node: getUser.create({}), items: [{ json: { id: "99" } }] });
      assert.equal(result.status, "failed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("returns result on non-2xx with errorPolicy=passthrough", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });

    try {
      const kit = new WorkflowTestKit();
      const getUser = defineRestNode({
        key: "test.get-user-passthrough",
        title: "Get User",
        api: { baseUrl: "https://api.example.com", path: "/items", method: "GET" },
        errorPolicy: "passthrough",
      });
      kit.registerDefinedNodes([getUser]);

      const result = await kit.runNode({ node: getUser.create({}), items: [{ json: {} }] });
      assert.equal(result.status, "completed");
      const item = result.status === "completed" ? result.outputs[0] : undefined;
      assert.ok(item);
      const output = item.json as { ok: boolean; status: number };
      assert.equal(output.ok, false);
      assert.equal(output.status, 404);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("substitutes path placeholders from input", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl: string | undefined;
    globalThis.fetch = async (url: RequestInfo | URL) => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : String(url);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    try {
      const kit = new WorkflowTestKit();
      const getItem = defineRestNode({
        key: "test.get-item-path",
        title: "Get Item",
        api: { baseUrl: "https://api.example.com", path: "/orgs/{orgId}/items/{itemId}", method: "GET" },
        inputSchema: z.object({ orgId: z.string(), itemId: z.string() }),
        errorPolicy: "passthrough",
      });
      kit.registerDefinedNodes([getItem]);

      await kit.runNode({ node: getItem.create({}), items: [{ json: { orgId: "org1", itemId: "item2" } }] });
      assert.ok(capturedUrl?.includes("/orgs/org1/items/item2"), `Expected path substitution, got: ${capturedUrl}`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
