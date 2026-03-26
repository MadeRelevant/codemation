import { describe, expect, it } from "vitest";

import { DevGatewayRuntimeRestartPolicy } from "../src/DevGatewayRuntimeRestartPolicy";

describe("DevGatewayRuntimeRestartPolicy", () => {
  it("skips runtime restart when Playwright browser e2e is active", () => {
    const policy = new DevGatewayRuntimeRestartPolicy({
      CODEMATION_PLAYWRIGHT_BROWSER_E2E: "1",
    } as NodeJS.ProcessEnv);
    expect(policy.shouldRestartOnBuildCompleted()).toBe(false);
  });

  it("restarts runtime by default when the Playwright e2e flag is unset", () => {
    const policy = new DevGatewayRuntimeRestartPolicy({} as NodeJS.ProcessEnv);
    expect(policy.shouldRestartOnBuildCompleted()).toBe(true);
  });
});
