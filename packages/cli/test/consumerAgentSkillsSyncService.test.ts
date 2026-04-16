import os from "node:os";
import path from "node:path";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSkillsExtractorFactory } from "../src/skills/AgentSkillsExtractorFactory";
import { ConsumerAgentSkillsAutoSyncPolicy } from "../src/skills/ConsumerAgentSkillsAutoSyncPolicy";
import { ConsumerAgentSkillsSyncService } from "../src/skills/ConsumerAgentSkillsSyncService";

describe("ConsumerAgentSkillsSyncService", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directoryPath) => rm(directoryPath, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("writes packaged skills under .agents/skills/extracted", async () => {
    const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-skills-sync-"));
    temporaryDirectories.push(consumerRoot);

    const service = new ConsumerAgentSkillsSyncService(
      new AgentSkillsExtractorFactory(),
      new ConsumerAgentSkillsAutoSyncPolicy(),
    );
    await service.sync(consumerRoot);

    const skillPath = path.join(consumerRoot, ".agents", "skills", "extracted", "codemation-cli", "SKILL.md");
    const contents = await readFile(skillPath, "utf8");
    expect(contents).toContain("name: codemation-cli");
  });

  it("preserves local skill dirs while refreshing codemation-* skills", async () => {
    const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-skills-sync-"));
    temporaryDirectories.push(consumerRoot);
    const extracted = path.join(consumerRoot, ".agents", "skills", "extracted");
    const localSkill = path.join(extracted, "local-skill");
    await mkdir(localSkill, { recursive: true });
    await writeFile(path.join(localSkill, "SKILL.md"), "---\nname: local-skill\n---\n");

    const service = new ConsumerAgentSkillsSyncService(
      new AgentSkillsExtractorFactory(),
      new ConsumerAgentSkillsAutoSyncPolicy(),
    );
    await service.sync(consumerRoot);

    await expect(readFile(path.join(localSkill, "SKILL.md"), "utf8")).resolves.toContain("local-skill");
    await expect(
      readFile(path.join(extracted, "codemation-framework-concepts", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: codemation-framework-concepts");
  });

  it("skips automatic sync inside the Codemation framework monorepo but still allows manual sync", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-framework-root-"));
    temporaryDirectories.push(repoRoot);
    const consumerRoot = path.join(repoRoot, "apps", "test-dev");
    await mkdir(consumerRoot, { recursive: true });
    await writeFile(path.join(repoRoot, "package.json"), JSON.stringify({ name: "codemation" }));
    await mkdir(path.join(repoRoot, "packages", "cli"), { recursive: true });
    await mkdir(path.join(repoRoot, "packages", "agent-skills"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "packages", "cli", "package.json"),
      JSON.stringify({ name: "@codemation/cli" }),
    );
    await writeFile(
      path.join(repoRoot, "packages", "agent-skills", "package.json"),
      JSON.stringify({ name: "@codemation/agent-skills" }),
    );

    const service = new ConsumerAgentSkillsSyncService(
      new AgentSkillsExtractorFactory(),
      new ConsumerAgentSkillsAutoSyncPolicy(),
    );
    await service.sync(consumerRoot, {
      mode: "automatic",
      repoRoot,
    });

    await expect(access(path.join(consumerRoot, ".agents", "skills", "extracted"))).rejects.toThrow();

    await service.sync(consumerRoot, {
      mode: "manual",
      repoRoot,
    });

    await expect(
      readFile(path.join(consumerRoot, ".agents", "skills", "extracted", "codemation-cli", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: codemation-cli");
  });
});
