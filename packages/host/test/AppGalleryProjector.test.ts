import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { McpServerDeclaration } from "@codemation/core";
import type { CredentialInstanceDto } from "../src/application/contracts/CredentialContractsRegistry";
import { AppGalleryProjector } from "../src/application/credentials/AppGalleryProjector";
import { CredentialTypeRegistryImpl } from "../src/domain/credentials/CredentialServices";
import { FakeLoggerFactory } from "./testkit";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRegistry(
  entries: ReadonlyArray<{ typeId: string; authKind?: "oauth2" | undefined }>,
): CredentialTypeRegistryImpl {
  const registry = new CredentialTypeRegistryImpl(new FakeLoggerFactory());
  registry.merge(
    "plugin",
    entries.map(({ typeId, authKind }) => ({
      definition: {
        typeId,
        displayName: typeId,
        auth: authKind === "oauth2" ? ({ kind: "oauth2", providerId: typeId, scopes: [] } as const) : undefined,
      },
      createSession: async () => ({}),
      test: async () => ({ status: "healthy" as const }),
    })),
  );
  return registry;
}

function makeProjector(
  entries: ReadonlyArray<{ typeId: string; authKind?: "oauth2" | undefined }>,
): AppGalleryProjector {
  return new AppGalleryProjector(makeRegistry(entries));
}

function makeInstance(overrides: Partial<CredentialInstanceDto> = {}): CredentialInstanceDto {
  return {
    instanceId: "inst-1",
    typeId: "type-a",
    displayName: "Instance A",
    sourceKind: "db",
    publicConfig: {},
    tags: [],
    setupStatus: "ready",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMcp(overrides: Partial<McpServerDeclaration> = {}): McpServerDeclaration {
  return {
    id: "mcp-a",
    displayName: "App A",
    description: "A description",
    transport: "http",
    url: "https://example.com",
    acceptedCredentialTypes: ["type-a"],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AppGalleryProjector", () => {
  test("empty catalog returns empty apps and all instances as custom", () => {
    const projector = makeProjector([]);
    const result = projector.project([], [makeInstance()]);
    assert.equal(result.apps.length, 0);
    assert.equal(result.customInstances.length, 1);
  });

  test("null mcpServers returns empty apps and all instances as custom (unpaired)", () => {
    const projector = makeProjector([{ typeId: "type-a", authKind: "oauth2" }]);
    const instance = makeInstance({ instanceId: "inst-1", typeId: "type-a" });
    const result = projector.project(null, [instance]);
    assert.equal(result.apps.length, 0);
    assert.equal(result.customInstances.length, 1);
    assert.equal(result.customInstances[0]!.instanceId, "inst-1");
  });

  test("single MCP single instance: instance categorised under tile", () => {
    const projector = makeProjector([{ typeId: "type-a", authKind: "oauth2" }]);
    const mcp = makeMcp({ id: "gmail", acceptedCredentialTypes: ["type-a"] });
    const instance = makeInstance({ instanceId: "inst-1", typeId: "type-a" });
    const result = projector.project([mcp], [instance]);
    assert.equal(result.apps.length, 1);
    assert.equal(result.apps[0]!.mcpId, "gmail");
    assert.equal(result.apps[0]!.instances.length, 1);
    assert.equal(result.apps[0]!.primaryOAuthTypeId, "type-a");
    assert.equal(result.customInstances.length, 0);
  });

  test("MCP with multiple accepted types: primaryOAuthTypeId is first OAuth type", () => {
    const projector = makeProjector([{ typeId: "type-api-key" }, { typeId: "type-oauth", authKind: "oauth2" }]);
    const mcp = makeMcp({
      acceptedCredentialTypes: ["type-api-key", "type-oauth"],
    });
    const result = projector.project([mcp], []);
    assert.equal(result.apps[0]!.primaryOAuthTypeId, "type-oauth");
  });

  test("non-OAuth instance linked to known MCP still shows under tile", () => {
    const projector = makeProjector([{ typeId: "type-service-account" }]);
    const mcp = makeMcp({ acceptedCredentialTypes: ["type-service-account"] });
    const instance = makeInstance({ instanceId: "inst-sa", typeId: "type-service-account" });
    const result = projector.project([mcp], [instance]);
    assert.equal(result.apps[0]!.instances.length, 1);
    assert.equal(result.apps[0]!.primaryOAuthTypeId, null);
    assert.equal(result.customInstances.length, 0);
  });

  test("instance with no MCP home lands in customInstances", () => {
    const projector = makeProjector([{ typeId: "type-custom" }]);
    const mcp = makeMcp({ acceptedCredentialTypes: ["type-known"] });
    const instance = makeInstance({ instanceId: "inst-custom", typeId: "type-custom" });
    const result = projector.project([mcp], [instance]);
    assert.equal(result.apps[0]!.instances.length, 0);
    assert.equal(result.customInstances.length, 1);
    assert.equal(result.customInstances[0]!.instanceId, "inst-custom");
  });
});
