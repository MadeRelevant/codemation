/**
 * Behavioral tests for GetCredentialFieldEnvStatusQueryHandler.
 * Tests env variable resolution from credential type field schemas.
 */
import { describe, expect, it } from "vitest";
import { GetCredentialFieldEnvStatusQueryHandler } from "../../src/application/queries/GetCredentialFieldEnvStatusQueryHandler";
import { CredentialTypeRegistryImpl } from "../../src/domain/credentials/CredentialServices";
import { FakeLoggerFactory } from "../testkit/LoggerTestKit";

function makeHandler(
  types: {
    publicFields?: { key: string; envVarName?: string }[];
    secretFields?: { key: string; envVarName?: string }[];
  }[],
  env: Record<string, string>,
) {
  const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
  for (const [i, type] of types.entries()) {
    registry.register({
      definition: {
        typeId: `test.type.${i}`,
        displayName: `Type ${i}`,
        publicFields: type.publicFields ?? [],
        secretFields: type.secretFields ?? [],
        supportedSourceKinds: ["db"],
      },
      createSession: async () => ({}),
      test: async () => ({ status: "passing" }),
    } as never);
  }
  const appConfig = { env };
  return new GetCredentialFieldEnvStatusQueryHandler(registry, appConfig as never);
}

describe("GetCredentialFieldEnvStatusQueryHandler.execute", () => {
  it("returns empty object when no types registered", async () => {
    const handler = makeHandler([], {});
    const result = await handler.execute();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("returns false for missing env variables", async () => {
    const handler = makeHandler(
      [{ publicFields: [{ key: "api_key", envVarName: "MY_API_KEY" }] }],
      {}, // Empty env
    );
    const result = await handler.execute();
    expect(result).toHaveProperty("MY_API_KEY", false);
  });

  it("returns true for present env variables", async () => {
    const handler = makeHandler([{ publicFields: [{ key: "api_key", envVarName: "MY_API_KEY" }] }], {
      MY_API_KEY: "some-value",
    });
    const result = await handler.execute();
    expect(result).toHaveProperty("MY_API_KEY", true);
  });

  it("returns false for empty string env variable", async () => {
    const handler = makeHandler([{ secretFields: [{ key: "secret", envVarName: "MY_SECRET" }] }], { MY_SECRET: "" });
    const result = await handler.execute();
    expect(result).toHaveProperty("MY_SECRET", false);
  });

  it("deduplicates env var names across types", async () => {
    const handler = makeHandler(
      [
        { publicFields: [{ key: "k1", envVarName: "SHARED_VAR" }] },
        { secretFields: [{ key: "k2", envVarName: "SHARED_VAR" }] },
      ],
      { SHARED_VAR: "value" },
    );
    const result = await handler.execute();
    const keys = Object.keys(result);
    expect(keys.filter((k) => k === "SHARED_VAR")).toHaveLength(1);
    expect(result.SHARED_VAR).toBe(true);
  });

  it("skips fields with no envVarName", async () => {
    const handler = makeHandler([{ publicFields: [{ key: "plain_field" /* no envVarName */ }] }], {});
    const result = await handler.execute();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles undefined publicFields or secretFields", async () => {
    // Type with neither publicFields nor secretFields set
    const handler = makeHandler([{}], {});
    const result = await handler.execute();
    expect(Object.keys(result)).toHaveLength(0);
  });
});
