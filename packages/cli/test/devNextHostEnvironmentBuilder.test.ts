import path from "node:path";
import { describe, expect, it } from "vitest";

import { ConsumerEnvLoader } from "../src/consumer/ConsumerEnvLoader";
import { DevNextHostEnvironmentBuilder } from "../src/dev/DevNextHostEnvironmentBuilder";
import { SourceMapNodeOptions } from "../src/runtime/SourceMapNodeOptions";

describe("DevNextHostEnvironmentBuilder", () => {
  it("sets CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH to .codemation/output/current.json under consumer root", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const consumerRoot = path.resolve("/tmp/my-consumer");
    const env = builder.build({
      authConfigJson: "{}",
      consumerRoot,
      developmentServerToken: "token",
      nextPort: 3000,
      skipUiAuth: true,
      websocketPort: 3001,
    });
    expect(env.CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH).toBe(
      path.resolve(consumerRoot, ".codemation", "output", "current.json"),
    );
  });

  it("allows overriding consumerOutputManifestPath", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const override = path.resolve("/tmp", "custom-manifest.json");
    const env = builder.build({
      authConfigJson: "{}",
      consumerRoot: path.resolve("/tmp/my-consumer"),
      developmentServerToken: "token",
      nextPort: 3000,
      skipUiAuth: true,
      websocketPort: 3001,
      consumerOutputManifestPath: override,
    });
    expect(env.CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH).toBe(override);
  });

  it("buildConsumerUiProxy includes runtime proxy and auth secrets for packaged consumer mode", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const consumerRoot = path.resolve("/tmp/my-consumer");
    const env = builder.buildConsumerUiProxy({
      authConfigJson: '{"kind":"local"}',
      authSecret: "dev-secret",
      consumerRoot,
      developmentServerToken: "token",
      nextPort: 4242,
      publicBaseUrl: "http://127.0.0.1:3000",
      runtimeDevUrl: "http://127.0.0.1:3000",
      skipUiAuth: false,
      websocketPort: 3001,
    });

    expect(env.PORT).toBe("4242");
    expect(env.AUTH_URL).toBe("http://127.0.0.1:3000");
    expect(env.CODEMATION_RUNTIME_DEV_URL).toBe("http://127.0.0.1:3000");
    expect(env.AUTH_SECRET).toBe("dev-secret");
    expect(env.CODEMATION_FRONTEND_APP_CONFIG_JSON).toContain('"uiAuthEnabled":true');
    expect(env.CODEMATION_SKIP_STARTUP_MIGRATIONS).toBe("true");
    expect(env.HOSTNAME).toBe("127.0.0.1");
  });
});
