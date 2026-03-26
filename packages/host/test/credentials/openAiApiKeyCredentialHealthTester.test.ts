import { describe, expect, it } from "vitest";

import type { CredentialInstanceRecord } from "../../src/domain/credentials/CredentialServices";
import type { OpenAiApiKeyPublicConfig } from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialShapes.types";
import { OpenAiApiKeyCredentialHealthTester } from "../../src/infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";

describe("OpenAiApiKeyCredentialHealthTester", () => {
  const minimalInstance: CredentialInstanceRecord<OpenAiApiKeyPublicConfig> = {
    instanceId: "cred.inst.openai.test",
    typeId: "openai.apiKey",
    displayName: "OpenAI",
    sourceKind: "db",
    publicConfig: {},
    secretRef: { kind: "db" },
    tags: [],
    setupStatus: "ready",
    createdAt: "",
    updatedAt: "",
  };

  it("returns failing when api key is empty", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      throw new Error("fetch should not be called");
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "   " },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toContain("empty");
  });

  it("calls GET /v1/models with Bearer auth and returns healthy on 200", async () => {
    let capturedUrl: string | undefined;
    let capturedAuth: string | undefined;
    const tester = new OpenAiApiKeyCredentialHealthTester(async (url, init) => {
      capturedUrl = String(url);
      const headers = init?.headers;
      if (headers instanceof Headers) {
        capturedAuth = headers.get("Authorization") ?? undefined;
      } else if (headers && typeof headers === "object") {
        capturedAuth = String((headers as Record<string, string>).Authorization ?? "");
      }
      return new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-test" },
      publicConfig: {},
    });
    expect(result.status).toBe("healthy");
    expect(capturedUrl).toBe("https://api.openai.com/v1/models");
    expect(capturedAuth).toBe("Bearer sk-test");
  });

  it("resolves a custom base URL ending with /v1", async () => {
    let capturedUrl: string | undefined;
    const tester = new OpenAiApiKeyCredentialHealthTester(async (url) => {
      capturedUrl = String(url);
      return new Response("{}", { status: 200 });
    });
    await tester.test({
      instance: minimalInstance,
      material: { apiKey: "k" },
      publicConfig: { baseUrl: "https://example.com/custom/v1" },
    });
    expect(capturedUrl).toBe("https://example.com/custom/v1/models");
  });

  it("appends /v1/models when base URL has no /v1 suffix", async () => {
    let capturedUrl: string | undefined;
    const tester = new OpenAiApiKeyCredentialHealthTester(async (url) => {
      capturedUrl = String(url);
      return new Response("{}", { status: 200 });
    });
    await tester.test({
      instance: minimalInstance,
      material: { apiKey: "k" },
      publicConfig: { baseUrl: "https://gateway.example" },
    });
    expect(capturedUrl).toBe("https://gateway.example/v1/models");
  });

  it("uses a full models URL when baseUrl already ends with /models", async () => {
    let capturedUrl: string | undefined;
    const tester = new OpenAiApiKeyCredentialHealthTester(async (url) => {
      capturedUrl = String(url);
      return new Response("{}", { status: 200 });
    });
    await tester.test({
      instance: minimalInstance,
      material: { apiKey: "k" },
      publicConfig: { baseUrl: "https://proxy.example/v1/models" },
    });
    expect(capturedUrl).toBe("https://proxy.example/v1/models");
  });

  it("returns failing with API error message on 401", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      return new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-bad" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toContain("401");
    expect(result.message).toContain("Incorrect API key");
  });

  it("returns failing with HTTP status only when error body is empty", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      return new Response("", { status: 502 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toBe("HTTP 502");
  });

  it("returns failing with HTTP prefix only when error body is not valid JSON", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      return new Response("not json", { status: 500 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toBe("HTTP 500");
  });

  it("returns failing with body snippet when JSON parses but has no error.message", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      return new Response(JSON.stringify({ unrelated: true }), { status: 403 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toContain("HTTP 403");
    expect(result.message).toContain("unrelated");
  });

  it("truncates long error bodies when JSON parses but has no error.message", async () => {
    const longPayload = "x".repeat(400);
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      return new Response(JSON.stringify({ payload: longPayload }), { status: 400 });
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toContain("HTTP 400");
    expect(result.message).toContain("…");
    expect(result.message!.length).toBeLessThan(longPayload.length + 40);
  });

  it("returns failing with HTTP prefix when reading error body fails", async () => {
    const brokenResponse = {
      ok: false,
      status: 503,
      text: async () => {
        throw new Error("read failed");
      },
    } as unknown as Response;
    const testerBroken = new OpenAiApiKeyCredentialHealthTester(async () => brokenResponse);
    const result = await testerBroken.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toBe("HTTP 503");
  });

  it("returns failing when fetch throws", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      throw new Error("network down");
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toBe("network down");
  });

  it("returns failing with stringified value when fetch throws a non-Error", async () => {
    const tester = new OpenAiApiKeyCredentialHealthTester(async () => {
      throw "upstream";
    });
    const result = await tester.test({
      instance: minimalInstance,
      material: { apiKey: "sk-x" },
      publicConfig: {},
    });
    expect(result.status).toBe("failing");
    expect(result.message).toBe("upstream");
  });
});
