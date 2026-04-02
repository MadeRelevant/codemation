import { describe, expect, it } from "vitest";

import { SandboxFactory } from "../../src/presentation/config/SandboxFactory";

describe("SandboxFactory", () => {
  it("applies local-dev defaults and productName", () => {
    const config = SandboxFactory.create({ productName: "My plugin" });
    expect(config.app?.auth?.kind).toBe("local");
    expect(config.app?.auth?.allowUnauthenticatedInDevelopment).toBe(true);
    expect(config.app?.database?.kind).toBe("pglite");
    expect(config.app?.database?.pgliteDataDir).toBe(".codemation/pglite");
    expect(config.app?.scheduler?.kind).toBe("inline");
    expect(config.app?.whitelabel?.productName).toBe("My plugin");
  });

  it("merges partial app overrides without dropping other defaults", () => {
    const config = SandboxFactory.create({
      productName: "Base",
      config: {
        app: {
          whitelabel: {
            productName: "Override name",
          },
        },
      },
    });
    expect(config.app?.whitelabel?.productName).toBe("Override name");
    expect(config.app?.database?.kind).toBe("pglite");
    expect(config.app?.auth?.allowUnauthenticatedInDevelopment).toBe(true);
  });

  it("passes through top-level config fields", () => {
    const config = SandboxFactory.create({
      productName: "P",
      config: {
        workflows: [],
      },
    });
    expect(config.workflows).toEqual([]);
  });
});
