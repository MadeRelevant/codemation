import { describe, expect, it } from "vitest";
import type { CredentialTypeDefinition } from "@codemation/core";
import { CredentialFieldEnvOverlayService } from "../../src/domain/credentials/CredentialFieldEnvOverlayService";
import { makeAppConfig } from "../testkit/AppConfigFixturesFactory";

function makeDefinition(
  publicFields: CredentialTypeDefinition["publicFields"] = [],
  secretFields: CredentialTypeDefinition["secretFields"] = [],
): CredentialTypeDefinition {
  return {
    typeId: "test",
    displayName: "Test",
    publicFields,
    secretFields,
    supportedSourceKinds: ["db"],
  } as unknown as CredentialTypeDefinition;
}

function makeService(env: Record<string, string> = {}): CredentialFieldEnvOverlayService {
  return new CredentialFieldEnvOverlayService(makeAppConfig({ env }));
}

describe("CredentialFieldEnvOverlayService.isFieldResolvedFromEnv", () => {
  it("returns false when field has no envVarName", () => {
    const svc = makeService({ MY_VAR: "value" });
    expect(svc.isFieldResolvedFromEnv({ key: "field", label: "Field" } as never)).toBe(false);
  });

  it("returns false when env var is not set", () => {
    const svc = makeService({});
    expect(svc.isFieldResolvedFromEnv({ key: "k", label: "L", envVarName: "MISSING_VAR" } as never)).toBe(false);
  });

  it("returns false when env var is empty", () => {
    const svc = makeService({ MY_VAR: "" });
    expect(svc.isFieldResolvedFromEnv({ key: "k", label: "L", envVarName: "MY_VAR" } as never)).toBe(false);
  });

  it("returns true when env var has a value", () => {
    const svc = makeService({ MY_VAR: "some-value" });
    expect(svc.isFieldResolvedFromEnv({ key: "k", label: "L", envVarName: "MY_VAR" } as never)).toBe(true);
  });

  it("returns false when envVarName is whitespace-only", () => {
    const svc = makeService({ "  ": "value" });
    expect(svc.isFieldResolvedFromEnv({ key: "k", label: "L", envVarName: "   " } as never)).toBe(false);
  });
});

describe("CredentialFieldEnvOverlayService.apply", () => {
  it("returns unchanged config when no fields have envVarName", () => {
    const svc = makeService({ SOME_VAR: "value" });
    const def = makeDefinition(
      [{ key: "tenant", label: "Tenant" } as never],
      [{ key: "secret", label: "Secret" } as never],
    );
    const result = svc.apply({ definition: def, publicConfig: { tenant: "t1" }, material: { secret: "s1" } });
    expect(result.resolvedPublicConfig).toEqual({ tenant: "t1" });
    expect(result.resolvedMaterial).toEqual({ secret: "s1" });
  });

  it("overlays public field from env when env var is set", () => {
    const svc = makeService({ TENANT_ID: "env-tenant" });
    const def = makeDefinition([{ key: "tenant", label: "Tenant", envVarName: "TENANT_ID" } as never]);
    const result = svc.apply({ definition: def, publicConfig: { tenant: "original" }, material: {} });
    expect(result.resolvedPublicConfig.tenant).toBe("env-tenant");
  });

  it("does not overlay public field when env var is not set", () => {
    const svc = makeService({});
    const def = makeDefinition([{ key: "tenant", label: "Tenant", envVarName: "MISSING" } as never]);
    const result = svc.apply({ definition: def, publicConfig: { tenant: "original" }, material: {} });
    expect(result.resolvedPublicConfig.tenant).toBe("original");
  });

  it("overlays secret material field from env when env var is set", () => {
    const svc = makeService({ CLIENT_SECRET: "env-secret" });
    const def = makeDefinition([], [{ key: "clientSecret", label: "Secret", envVarName: "CLIENT_SECRET" } as never]);
    const result = svc.apply({ definition: def, publicConfig: {}, material: { clientSecret: "original-secret" } });
    expect(result.resolvedMaterial.clientSecret).toBe("env-secret");
  });

  it("does not modify original publicConfig object", () => {
    const svc = makeService({ TENANT: "env-val" });
    const def = makeDefinition([{ key: "tenant", label: "T", envVarName: "TENANT" } as never]);
    const publicConfig = { tenant: "original" };
    svc.apply({ definition: def, publicConfig, material: {} });
    expect(publicConfig.tenant).toBe("original");
  });

  it("handles definition with no publicFields or secretFields gracefully", () => {
    const svc = makeService({ MY_VAR: "val" });
    const def = makeDefinition([], []);
    expect(() => svc.apply({ definition: def, publicConfig: {}, material: {} })).not.toThrow();
  });
});
