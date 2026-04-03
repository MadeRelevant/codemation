import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CodemationAgentSkillsCli } from "../bin/codemation-agent-skills.mjs";

class TemporaryDirectoryFactory {
  async create(): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), "codemation-agent-skills-test-"));
  }
}

class AgentSkillsCliHarness {
  private readonly stdout = new OutputBuffer();
  private readonly stderr = new OutputBuffer();

  constructor(
    private readonly packageRoot: string,
    private readonly temporaryDirectoryFactory: TemporaryDirectoryFactory,
  ) {}

  async extractWithOutput(outputPath: string): Promise<void> {
    process.exitCode = 0;
    this.stdout.clear();
    this.stderr.clear();
    await new CodemationAgentSkillsCli(
      ["extract", "--output", outputPath],
      this.packageRoot,
      this.stdout,
      this.stderr,
    ).run();
    expect(process.exitCode).toBe(0);
    expect(this.stderr.toString()).toBe("");
  }

  async createTemporaryDirectory(): Promise<string> {
    return this.temporaryDirectoryFactory.create();
  }
}

class OutputBuffer {
  private contents = "";

  write(value: string) {
    this.contents += value;
  }

  clear() {
    this.contents = "";
  }

  toString(): string {
    return this.contents;
  }
}

describe("codemation-agent-skills extract", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const harness = new AgentSkillsCliHarness(packageRoot, new TemporaryDirectoryFactory());
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.map((directoryPath) => rm(directoryPath, { force: true, recursive: true })));
    temporaryDirectories.length = 0;
  });

  it("extracts the packaged skills into the target directory", async () => {
    const tempDirectory = await harness.createTemporaryDirectory();
    temporaryDirectories.push(tempDirectory);
    const outputPath = path.join(tempDirectory, ".agents", "skills", "extracted");

    await harness.extractWithOutput(outputPath);

    const skillFilePath = path.join(outputPath, "codemation-cli", "SKILL.md");
    const skillFileContents = await readFile(skillFilePath, "utf8");

    expect(skillFileContents).toContain("name: codemation-cli");
  });

  it("removes stale extracted Codemation skills before copying the packaged set", async () => {
    const tempDirectory = await harness.createTemporaryDirectory();
    temporaryDirectories.push(tempDirectory);
    const outputPath = path.join(tempDirectory, ".agents", "skills", "extracted");
    const staleSkillDirectoryPath = path.join(outputPath, "codemation-stale-skill");
    const nonCodemationDirectoryPath = path.join(outputPath, "local-skill");

    await mkdir(staleSkillDirectoryPath, { recursive: true });
    await writeFile(path.join(staleSkillDirectoryPath, "SKILL.md"), "---\nname: codemation-stale-skill\n---\n");
    await mkdir(nonCodemationDirectoryPath, { recursive: true });
    await writeFile(path.join(nonCodemationDirectoryPath, "SKILL.md"), "---\nname: local-skill\n---\n");

    await harness.extractWithOutput(outputPath);

    await expect(readFile(path.join(staleSkillDirectoryPath, "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(nonCodemationDirectoryPath, "SKILL.md"), "utf8")).resolves.toContain("local-skill");
    await expect(
      readFile(path.join(outputPath, "codemation-framework-concepts", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: codemation-framework-concepts");
  });
});
