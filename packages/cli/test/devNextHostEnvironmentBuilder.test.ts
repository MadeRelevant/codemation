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
});
