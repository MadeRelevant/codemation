import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import type { CodemationPluginDiscovery } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";

import { BuildCommand } from "../src/commands/BuildCommand";
import type { ConsumerBuildArtifactsPublisher } from "../src/build/ConsumerBuildArtifactsPublisher";
import type { ConsumerOutputBuilderFactory } from "../src/consumer/ConsumerOutputBuilderFactory";
import type { ConsumerBuildOptions } from "../src/consumer/consumerBuildOptions.types";
import { CliPathResolver } from "../src/path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../src/runtime/TypeScriptRuntimeConfigurator";
import type { ConsumerAgentSkillsSyncService } from "../src/skills/ConsumerAgentSkillsSyncService";

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

class RecordingAgentSkillsSync {
  public readonly consumerRoots: string[] = [];

  async sync(consumerRoot: string): Promise<void> {
    this.consumerRoots.push(consumerRoot);
  }
}

const buildOptions: ConsumerBuildOptions = { sourceMaps: true, target: "es2022" };

test("BuildCommand syncs packaged agent skills before resolving the build", async () => {
  const recording = new RecordingAgentSkillsSync();
  const consumerRoot = path.resolve("/tmp", "codemation-build-skills-test-root");

  const buildCommand = new BuildCommand(
    silentLogger,
    new CliPathResolver(),
    recording as unknown as ConsumerAgentSkillsSyncService,
    {
      create: () => ({
        ensureBuilt: async () => {
          throw new Error("build-stop");
        },
      }),
    } as unknown as ConsumerOutputBuilderFactory,
    {} as unknown as CodemationPluginDiscovery,
    {} as unknown as ConsumerBuildArtifactsPublisher,
    {
      configure: () => {},
    } as unknown as TypeScriptRuntimeConfigurator,
  );

  await assert.rejects(() => buildCommand.execute(consumerRoot, buildOptions), /build-stop/);

  assert.deepEqual(recording.consumerRoots, [consumerRoot]);
});
