import { describe, expect, it } from "vitest";

import { ScaffoldedBrowserRuntimeEnvironment } from "./harness/ScaffoldedBrowserRuntimeEnvironment";

describe("ScaffoldedBrowserRuntimeEnvironment", () => {
  it("clears managed CI infrastructure when preparing packed scaffold installs", () => {
    const environment = new ScaffoldedBrowserRuntimeEnvironment();

    const result = environment.createPublishedInstallEnvironment({
      DATABASE_URL: "postgresql://ci-user:ci-password@127.0.0.1:5432/codemation",
      REDIS_URL: "redis://127.0.0.1:6379",
      CI: "true",
      GITHUB_ACTIONS: "true",
    });

    expect(result.DATABASE_URL).toBe("");
    expect(result.REDIS_URL).toBe("");
    expect(result.CODEMATION_DATABASE_KIND).toBe("pglite");
    expect(result.CODEMATION_SCHEDULER).toBe("local");
    expect(result.CODEMATION_EVENT_BUS).toBe("memory");
    expect(result.CI).toBe("");
    expect(result.GITHUB_ACTIONS).toBe("");
  });
});
