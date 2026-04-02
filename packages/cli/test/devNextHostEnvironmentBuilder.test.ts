import path from "node:path";
import { describe, expect, it } from "vitest";

import { ConsumerEnvLoader } from "../src/consumer/ConsumerEnvLoader";
import { DevNextHostEnvironmentBuilder } from "../src/dev/DevNextHostEnvironmentBuilder";
import { SourceMapNodeOptions } from "../src/runtime/SourceMapNodeOptions";

describe("DevNextHostEnvironmentBuilder", () => {
  it("sets the direct consumer root and edge auth flag", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const consumerRoot = path.resolve("/tmp/my-consumer");
    const env = builder.build({
      consumerRoot,
      developmentServerToken: "token",
      nextPort: 3000,
      skipUiAuth: true,
      websocketPort: 3001,
    });
    expect(env.CODEMATION_CONSUMER_ROOT).toBe(consumerRoot);
    expect(env.CODEMATION_UI_AUTH_ENABLED).toBe("false");
  });

  it("allows overriding the config path for the Next host", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const override = path.resolve("/tmp", "custom.config.ts");
    const env = builder.build({
      consumerRoot: path.resolve("/tmp/my-consumer"),
      configPathOverride: override,
      developmentServerToken: "token",
      nextPort: 3000,
      skipUiAuth: true,
      websocketPort: 3001,
    });
    expect(env.CODEMATION_CONFIG_PATH).toBe(override);
  });

  it("buildConsumerUiProxy includes runtime proxy and auth secrets for packaged consumer mode", () => {
    const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
    const consumerRoot = path.resolve("/tmp/my-consumer");
    const env = builder.buildConsumerUiProxy({
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
    expect(env.CODEMATION_UI_AUTH_ENABLED).toBe("true");
    expect(env.CODEMATION_SKIP_STARTUP_MIGRATIONS).toBe("true");
    expect(env.HOSTNAME).toBe("127.0.0.1");
  });
});
