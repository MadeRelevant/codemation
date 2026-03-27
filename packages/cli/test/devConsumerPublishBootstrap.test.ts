import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Logger } from "@codemation/host/next/server";
import { CodemationPluginDiscovery } from "@codemation/host/server";
import { test } from "vitest";

import { ConsumerBuildArtifactsPublisher } from "../src/build/ConsumerBuildArtifactsPublisher";
import { ConsumerBuildOptionsParser } from "../src/build/ConsumerBuildOptionsParser";
import { ConsumerOutputBuilderLoader } from "../src/consumer/Loader";
import { DevConsumerPublishBootstrap } from "../src/dev/DevConsumerPublishBootstrap";
import { CliPathResolver } from "../src/path/CliPathResolver";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const fixtureConfig = `export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;

function workflowSource(name: string): string {
  return `export default {
  id: "wf.cli.fixture",
  name: ${JSON.stringify(name)},
  nodes: [],
  edges: [],
};
`;
}

test("DevConsumerPublishBootstrap ensurePublished writes current.json under the consumer root", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  let tempRoot: string | null = null;
  try {
    process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-dev-publish-"));
    await writeFile(path.join(tempRoot, "codemation.config.ts"), fixtureConfig, "utf8");
    const workflowPath = path.join(tempRoot, "src", "workflows", "fixture.ts");
    await mkdir(path.dirname(workflowPath), { recursive: true });
    await writeFile(workflowPath, workflowSource("Fixture one"), "utf8");

    const paths = await new CliPathResolver().resolve(tempRoot);
    await new DevConsumerPublishBootstrap(
      silentLogger,
      new CodemationPluginDiscovery(),
      new ConsumerBuildArtifactsPublisher(),
      new ConsumerOutputBuilderLoader(),
      new ConsumerBuildOptionsParser(),
    ).ensurePublished(paths);

    const manifestPath = path.join(tempRoot, ".codemation", "output", "current.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { consumerRoot: string };
    assert.equal(manifest.consumerRoot, tempRoot);
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { force: true, recursive: true }).catch(() => null);
    }
    if (savedTsconfig === undefined) {
      delete process.env.CODEMATION_TSCONFIG_PATH;
    } else {
      process.env.CODEMATION_TSCONFIG_PATH = savedTsconfig;
    }
  }
});
