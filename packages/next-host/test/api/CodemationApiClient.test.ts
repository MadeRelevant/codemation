import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import { CodemationApiClient } from "../../src/api/CodemationApiClient";
import { CodemationApiHttpError } from "../../src/api/CodemationApiHttpError";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("CodemationApiClient", () => {
  let client: CodemationApiClient;

  beforeEach(() => {
    client = new CodemationApiClient();
  });

  describe("delete", () => {
    it("issues a DELETE request and resolves when the response is ok", async () => {
      let capturedMethod: string | undefined;
      globalThis.fetch = async (_input, init) => {
        capturedMethod = init?.method;
        return new Response(null, { status: 204 });
      };

      await client.delete("/api/things/1");

      assert.equal(capturedMethod, "DELETE");
    });

    it("throws CodemationApiHttpError with status and body text when the response is not ok", async () => {
      globalThis.fetch = async () =>
        new Response("Not Found", {
          status: 404,
          headers: { "content-type": "text/plain" },
        });

      let thrown: unknown;
      try {
        await client.delete("/api/things/missing");
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown instanceof CodemationApiHttpError);
      assert.equal((thrown as CodemationApiHttpError).status, 404);
    });
  });

  describe("putJson", () => {
    it("issues a PUT request with JSON body and content-type header", async () => {
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;
      let capturedContentType: string | null = null;

      globalThis.fetch = async (_input, init) => {
        capturedMethod = init?.method;
        capturedBody = init?.body as string;
        capturedContentType = new Headers(init?.headers).get("content-type");
        return new Response(JSON.stringify({ updated: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const result = await client.putJson<{ updated: boolean }>("/api/things/1", { name: "new-name" });

      assert.equal(capturedMethod, "PUT");
      assert.deepEqual(JSON.parse(capturedBody!), { name: "new-name" });
      assert.equal(capturedContentType, "application/json");
      assert.deepEqual(result, { updated: true });
    });

    it("throws CodemationApiHttpError when PUT response is not ok", async () => {
      globalThis.fetch = async () => new Response("Server Error", { status: 500 });

      let thrown: unknown;
      try {
        await client.putJson("/api/things/1", {});
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown instanceof CodemationApiHttpError);
      assert.equal((thrown as CodemationApiHttpError).status, 500);
    });
  });

  describe("postFormData", () => {
    it("issues a POST request with the FormData body and does not override content-type", async () => {
      let capturedMethod: string | undefined;
      let capturedBody: unknown;
      let capturedHeaders: Headers | undefined;

      const formData = new FormData();
      formData.append("file", new Blob(["hello"]), "hello.txt");

      globalThis.fetch = async (_input, init) => {
        capturedMethod = init?.method;
        capturedBody = init?.body;
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ uploaded: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const result = await client.postFormData<{ uploaded: boolean }>("/api/upload", formData);

      assert.equal(capturedMethod, "POST");
      assert.equal(capturedBody, formData);
      // content-type must NOT be set by the client (browser sets it with boundary)
      assert.equal(capturedHeaders?.get("content-type"), null);
      assert.deepEqual(result, { uploaded: true });
    });
  });

  describe("patchJson", () => {
    it("issues a PATCH request with JSON body and content-type header", async () => {
      let capturedMethod: string | undefined;
      let capturedBody: string | undefined;
      let capturedContentType: string | null = null;

      globalThis.fetch = async (_input, init) => {
        capturedMethod = init?.method;
        capturedBody = init?.body as string;
        capturedContentType = new Headers(init?.headers).get("content-type");
        return new Response(JSON.stringify({ patched: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const result = await client.patchJson<{ patched: boolean }>("/api/things/1", { active: false });

      assert.equal(capturedMethod, "PATCH");
      assert.deepEqual(JSON.parse(capturedBody!), { active: false });
      assert.equal(capturedContentType, "application/json");
      assert.deepEqual(result, { patched: true });
    });

    it("throws CodemationApiHttpError when PATCH response is not ok", async () => {
      globalThis.fetch = async () => new Response("Conflict", { status: 409 });

      let thrown: unknown;
      try {
        await client.patchJson("/api/things/1", {});
      } catch (err) {
        thrown = err;
      }

      assert.ok(thrown instanceof CodemationApiHttpError);
      assert.equal((thrown as CodemationApiHttpError).status, 409);
    });
  });

  describe("parseJsonBody fallback paths", () => {
    it("falls back to text() and parses JSON when json() throws", async () => {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async (): Promise<unknown> => {
            throw new Error("JSON parse error");
          },
          text: async () => '{"fallback":true}',
        }) as Response;

      const result = await client.getJson<{ fallback: boolean }>("/api/data");

      assert.deepEqual(result, { fallback: true });
    });

    it("returns undefined when json() throws and text() is empty", async () => {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async (): Promise<unknown> => {
            throw new Error("JSON parse error");
          },
          text: async () => "   ",
        }) as Response;

      const result = await client.getJson<unknown>("/api/data");

      assert.equal(result, undefined);
    });

    it("returns undefined when json() throws and response has no text() function", async () => {
      globalThis.fetch = async () =>
        ({
          ok: true,
          json: async (): Promise<unknown> => {
            throw new Error("JSON parse error");
          },
          // no text property at all
        }) as Response;

      const result = await client.getJson<unknown>("/api/data");

      assert.equal(result, undefined);
    });
  });
});
