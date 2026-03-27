// @vitest-environment node

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodemationConfig } from "../../src/presentation/config/CodemationConfig";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { FrontendHttpIntegrationHarness } from "./testkit/FrontendHttpIntegrationHarness";

class WhitelabelLogoFixture {
  static readonly secret = "codemation-whitelabel-test-secret-min-32-chars";

  static createBaseConfig(overrides: Partial<NonNullable<CodemationConfig["whitelabel"]>> = {}): CodemationConfig {
    return {
      runtime: {
        eventBus: { kind: "memory" },
        scheduler: { kind: "local" },
      },
      auth: { kind: "local" },
      whitelabel: {
        logoPath: "branding/logo.svg",
        productName: "WL test",
        ...overrides,
      },
    };
  }
}

describe("http whitelabel logo", () => {
  let harness: FrontendHttpIntegrationHarness;
  let tempConsumerRoot: string;

  beforeAll(async () => {
    tempConsumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-wl-"));
    await mkdir(path.join(tempConsumerRoot, "branding"), { recursive: true });
    await writeFile(
      path.join(tempConsumerRoot, "branding", "logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
      "utf8",
    );
    harness = new FrontendHttpIntegrationHarness({
      config: WhitelabelLogoFixture.createBaseConfig(),
      consumerRoot: tempConsumerRoot,
      env: {
        AUTH_SECRET: WhitelabelLogoFixture.secret,
      },
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("serves the logo anonymously with image/svg+xml", async () => {
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.whitelabelLogo(),
    });
    expect(response.statusCode).toBe(200);
    expect(String(response.header("content-type") ?? "")).toContain("image/svg+xml");
    expect(response.body).toContain("<svg");
  });
});

describe("http whitelabel logo path safety", () => {
  let harness: FrontendHttpIntegrationHarness;
  let tempConsumerRoot: string;

  beforeAll(async () => {
    tempConsumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-wl-bad-"));
    await mkdir(path.join(tempConsumerRoot, "branding"), { recursive: true });
    await writeFile(path.join(tempConsumerRoot, "branding", "logo.svg"), "<svg/>", "utf8");
    harness = new FrontendHttpIntegrationHarness({
      config: WhitelabelLogoFixture.createBaseConfig({
        logoPath: "../../../etc/passwd",
      }),
      consumerRoot: tempConsumerRoot,
      env: {
        AUTH_SECRET: WhitelabelLogoFixture.secret,
      },
    });
    await harness.start();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("returns 404 when logoPath resolves outside the consumer root", async () => {
    const response = await harness.request({
      method: "GET",
      url: ApiPaths.whitelabelLogo(),
    });
    expect(response.statusCode).toBe(404);
  });
});
