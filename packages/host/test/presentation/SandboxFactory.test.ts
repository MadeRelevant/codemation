import { describe, expect, it } from "vitest";

import { SandboxFactory } from "../../src/presentation/config/SandboxFactory";

describe("SandboxFactory", () => {
  it("applies local-dev defaults and productName", () => {
    const sandbox = SandboxFactory.create({ productName: "My plugin" });
    expect(sandbox.config.app?.auth?.kind).toBe("local");
    expect(sandbox.config.app?.auth?.allowUnauthenticatedInDevelopment).toBe(true);
    expect(sandbox.config.app?.database?.kind).toBe("pglite");
    expect(sandbox.config.app?.database?.pgliteDataDir).toBe(".codemation/pglite");
    expect(sandbox.config.app?.scheduler?.kind).toBe("inline");
    expect(sandbox.config.app?.whitelabel?.productName).toBe("My plugin");
    expect(sandbox.env).toEqual({
      CODEMATION_CREDENTIALS_MASTER_KEY: "codemation-local-dev-credentials-master-key",
    });
  });

  it("merges partial app overrides without dropping other defaults", () => {
    const sandbox = SandboxFactory.create({
      productName: "Base",
      config: {
        app: {
          whitelabel: {
            productName: "Override name",
          },
        },
      },
    });
    expect(sandbox.config.app?.whitelabel?.productName).toBe("Override name");
    expect(sandbox.config.app?.database?.kind).toBe("pglite");
    expect(sandbox.config.app?.auth?.allowUnauthenticatedInDevelopment).toBe(true);
  });

  it("passes through top-level config fields", () => {
    const sandbox = SandboxFactory.create({
      productName: "P",
      config: {
        workflows: [],
      },
    });
    expect(sandbox.config.workflows).toEqual([]);
  });

  it("merges sandbox env overrides over the defaults", () => {
    const sandbox = SandboxFactory.create({
      productName: "Env plugin",
      env: {
        CODEMATION_CREDENTIALS_MASTER_KEY: "override-master-key",
        CODEMATION_PUBLIC_BASE_URL: "http://127.0.0.1:3102",
      },
    });
    expect(sandbox.env).toEqual({
      CODEMATION_CREDENTIALS_MASTER_KEY: "override-master-key",
      CODEMATION_PUBLIC_BASE_URL: "http://127.0.0.1:3102",
    });
  });
});
